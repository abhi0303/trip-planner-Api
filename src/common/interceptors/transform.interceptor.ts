import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

/**
 * Wraps every handler result in the success envelope. A handler that returns
 * `{ items, nextCursor, hasMore }` is lifted into `{ data, meta }` so paginated
 * and single responses stay structurally predictable for FE.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRaw) return next.handle();

    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((payload) => {
        if (payload && typeof payload === 'object' && 'items' in payload && 'hasMore' in payload) {
          const { items, nextCursor, hasMore, total, ...rest } = payload as Record<string, any>;
          return {
            success: true,
            data: items,
            meta: { nextCursor: nextCursor ?? null, hasMore, total, ...rest },
            timestamp,
          };
        }
        return { success: true, data: payload ?? null, timestamp };
      }),
    );
  }
}
