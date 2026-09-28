import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { OffsetPaginationDto } from 'src/common/dto/pagination.dto';
import { SearchQueryDto } from './search-query.dto';

/** The same options main.ts installs globally. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  validationError: { target: false, value: false },
});

const validate = (metatype: new () => object, query: Record<string, string>) =>
  pipe.transform(query, { type: 'query', metatype });

describe('SearchQueryDto', () => {
  const query = { q: 'phi phi island', page: '1', limit: '20' };

  it('is why the paged search endpoints 400ed: q is not on the pagination DTO', async () => {
    await expect(validate(OffsetPaginationDto, query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts q alongside page and limit, and converts them to numbers', async () => {
    const dto = (await validate(SearchQueryDto, query)) as SearchQueryDto;
    expect(dto).toBeInstanceOf(SearchQueryDto);
    expect(dto.q).toBe('phi phi island');
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.skip).toBe(0);
  });

  it('keeps the pagination defaults when only q is sent', async () => {
    const dto = (await validate(SearchQueryDto, { q: 'goa' })) as SearchQueryDto;
    expect(dto.page).toBe(1);
    expect(dto.skip).toBe(0);
  });

  it('still rejects parameters it does not know', async () => {
    await expect(validate(SearchQueryDto, { q: 'goa', sort: 'new' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
