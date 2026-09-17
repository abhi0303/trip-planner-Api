import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory, ExpenseMode, Prisma } from '@prisma/client';
import { EXPENSE_SUBCATEGORIES, isValidSubcategory } from 'src/common/constants';
import { percentOf, round2, toNumber } from 'src/common/utils';
import { PrismaService } from 'src/prisma/prisma.service';
import { CategoryBreakdownDto, ExpenseSummaryDto } from './dto/trip-response.dto';
import { BulkExpensesDto, CreateExpenseDto, UpdateExpenseDto } from './dto/trip-sections.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tripId: string) {
    return this.prisma.tripExpense.findMany({
      where: { tripId },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(tripId: string, dto: CreateExpenseDto) {
    this.assertSubcategory(dto.category, dto.subcategory);

    const expense = await this.prisma.tripExpense.create({
      data: {
        tripId,
        category: dto.category,
        subcategory: dto.subcategory,
        amount: new Prisma.Decimal(dto.amount),
        currency: await this.tripCurrency(tripId),
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
        description: dto.description,
      },
    });

    await this.syncTripTotal(tripId);
    return expense;
  }

  async update(expenseId: string, dto: UpdateExpenseDto, ownerId: string) {
    const existing = await this.prisma.tripExpense.findUnique({
      where: { id: expenseId },
      include: { trip: { select: { id: true, userId: true } } },
    });
    if (!existing) throw new NotFoundException('Expense not found');
    if (existing.trip.userId !== ownerId) throw new NotFoundException('Expense not found');

    const category = dto.category ?? existing.category;
    const subcategory = dto.subcategory ?? existing.subcategory;
    this.assertSubcategory(category, subcategory);

    const updated = await this.prisma.tripExpense.update({
      where: { id: expenseId },
      data: {
        category: dto.category,
        subcategory: dto.subcategory,
        amount: dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
        description: dto.description,
      },
    });

    await this.syncTripTotal(existing.tripId);
    return updated;
  }

  async remove(expenseId: string, ownerId: string): Promise<{ message: string }> {
    const existing = await this.prisma.tripExpense.findUnique({
      where: { id: expenseId },
      include: { trip: { select: { id: true, userId: true } } },
    });
    if (!existing || existing.trip.userId !== ownerId) {
      throw new NotFoundException('Expense not found');
    }

    await this.prisma.tripExpense.delete({ where: { id: expenseId } });
    await this.syncTripTotal(existing.tripId);
    return { message: 'Expense removed' };
  }

  /** Replaces the whole set — matches how the wizard's expense step submits. */
  async replaceAll(tripId: string, dto: BulkExpensesDto) {
    for (const item of dto.expenses) this.assertSubcategory(item.category, item.subcategory);

    const currency = await this.tripCurrency(tripId);

    await this.prisma.$transaction([
      this.prisma.tripExpense.deleteMany({ where: { tripId } }),
      this.prisma.tripExpense.createMany({
        data: dto.expenses.map((e) => ({
          tripId,
          category: e.category,
          subcategory: e.subcategory,
          amount: new Prisma.Decimal(e.amount),
          currency,
          expenseDate: e.expenseDate ? new Date(e.expenseDate) : undefined,
          description: e.description,
        })),
      }),
    ]);

    await this.syncTripTotal(tripId);
    return this.summary(tripId);
  }

  /**
   * Expense intelligence (spec §9): totals, per-person, per-day,
   * per-person-per-day and category percentages.
   */
  async summary(tripId: string): Promise<ExpenseSummaryDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        expenseMode: true,
        totalExpense: true,
        currency: true,
        travelerCount: true,
        days: true,
        expenses: {
          select: { category: true, subcategory: true, amount: true },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const travelers = Math.max(trip.travelerCount, 1);
    const days = Math.max(trip.days, 1);

    const lineItemTotal = trip.expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
    // In DETAILED mode the line items are the source of truth; in TOTAL mode
    // the single number the user typed is.
    const total =
      trip.expenseMode === ExpenseMode.DETAILED ? lineItemTotal : toNumber(trip.totalExpense);

    return {
      mode: trip.expenseMode,
      currency: trip.currency,
      total: round2(total),
      perPerson: round2(total / travelers),
      perDay: round2(total / days),
      perPersonPerDay: round2(total / travelers / days),
      travelerCount: travelers,
      days,
      byCategory: this.breakdown(trip.expenses, total),
    };
  }

  private breakdown(
    expenses: { category: ExpenseCategory; subcategory: string | null; amount: Prisma.Decimal }[],
    total: number,
  ): CategoryBreakdownDto[] {
    const byCategory = new Map<ExpenseCategory, { amount: number; subs: Map<string, number> }>();

    for (const e of expenses) {
      const entry = byCategory.get(e.category) ?? { amount: 0, subs: new Map<string, number>() };
      const amount = toNumber(e.amount);
      entry.amount += amount;

      const sub = e.subcategory ?? 'OTHER';
      entry.subs.set(sub, (entry.subs.get(sub) ?? 0) + amount);
      byCategory.set(e.category, entry);
    }

    return [...byCategory.entries()]
      .map(([category, entry]) => ({
        category,
        amount: round2(entry.amount),
        percentage: percentOf(entry.amount, total),
        subcategories: [...entry.subs.entries()]
          .map(([subcategory, amount]) => ({ subcategory, amount: round2(amount) }))
          .sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  /** Keeps trips.totalExpense in step with the line items in DETAILED mode. */
  async syncTripTotal(tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { expenseMode: true },
    });
    if (trip?.expenseMode !== ExpenseMode.DETAILED) return;

    const sum = await this.prisma.tripExpense.aggregate({
      where: { tripId },
      _sum: { amount: true },
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { totalExpense: sum._sum.amount ?? new Prisma.Decimal(0) },
    });
  }

  private async tripCurrency(tripId: string): Promise<string> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { currency: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip.currency;
  }

  private assertSubcategory(category: ExpenseCategory, subcategory?: string | null): void {
    if (!isValidSubcategory(category, subcategory)) {
      throw new BadRequestException(
        `"${subcategory}" is not a valid subcategory for ${category}. Allowed: ${EXPENSE_SUBCATEGORIES[
          category
        ].join(', ')}`,
      );
    }
  }
}
