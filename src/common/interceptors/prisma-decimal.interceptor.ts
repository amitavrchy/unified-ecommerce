import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { Observable, map } from 'rxjs';

/**
 * Prisma serializes Decimal values as strings. The public API documents money
 * and ratings as JSON numbers, so normalize only plain Prisma result objects
 * immediately before Nest serializes the response.
 */
@Injectable()
export class PrismaDecimalInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((value) => normalizePrismaDecimals(value)));
  }
}

export function normalizePrismaDecimals(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (Array.isArray(value)) return value.map(normalizePrismaDecimals);
  if (
    value instanceof Date ||
    Buffer.isBuffer(value) ||
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      normalizePrismaDecimals(nested),
    ]),
  );
}
