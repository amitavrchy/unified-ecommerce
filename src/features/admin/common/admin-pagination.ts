import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { adminUtcRange } from './admin-date-range';

export const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
} as const;

export function adminSkip(query: { page: number; pageSize: number }) {
  return (query.page - 1) * query.pageSize;
}

export async function adminPage<T>(
  prisma: PrismaService,
  itemsQuery: Prisma.PrismaPromise<T[]>,
  totalQuery: Prisma.PrismaPromise<number>,
  query: { page: number; pageSize: number },
) {
  const [items, total] = await prisma.$transaction([itemsQuery, totalQuery]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export function adminCreatedAtFilter(query: {
  from?: string;
  to?: string;
  timezone?: string;
}): Prisma.DateTimeFilter | undefined {
  if (!query.from && !query.to) return undefined;
  if (!query.from || !query.to) {
    throw new BadRequestException('from and to must be provided together');
  }
  const range = adminUtcRange(query.from, query.to, query.timezone);
  return { gte: range.start, lt: range.end };
}
