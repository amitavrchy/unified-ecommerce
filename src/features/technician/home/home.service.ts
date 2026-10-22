import { Injectable } from '@nestjs/common';
import { RequestStatus } from '../../../../generated/prisma/enums';
import type { AuthUser } from '../../../common/auth/auth.types';
import { PrismaService } from '../../../database/prisma.service';
import {
  adminLocalTodayRange,
  adminLocalWeekRange,
  adminUtcRange,
} from '../../admin/common/admin-date-range';
import type { TechnicianHomeStatsQueryDto } from './dto/home.dto';

@Injectable()
export class TechnicianHomeService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(user: AuthUser, query: TechnicianHomeStatsQueryDto) {
    const timezone = query.timezone ?? 'UTC';
    const today = adminLocalTodayRange(timezone);
    const date = localDateString(new Date(), today.timezone);
    const [year, month] = date.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const monthRange = adminUtcRange(
      `${year}-${pad(month)}-01`,
      `${year}-${pad(month)}-${pad(lastDay)}`,
      today.timezone,
    );
    const weekRange = adminLocalWeekRange(date, today.timezone);

    const [
      profile,
      jobsToday,
      inProgress,
      completedThisMonth,
      weeklyTasks,
      completedThisWeek,
      totalCompleted,
      upcoming,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          firstName: true,
          technician: { select: { rating: true } },
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          technicianId: user.id,
          status: {
            in: [RequestStatus.SCHEDULED, RequestStatus.IN_PROGRESS],
          },
          scheduledStart: { gte: today.start, lt: today.end },
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          technicianId: user.id,
          status: RequestStatus.IN_PROGRESS,
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          technicianId: user.id,
          status: RequestStatus.COMPLETED,
          OR: [
            { completedAt: { gte: monthRange.start, lt: monthRange.end } },
            {
              completedAt: null,
              scheduledStart: { gte: monthRange.start, lt: monthRange.end },
            },
          ],
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          technicianId: user.id,
          status: { not: RequestStatus.CANCELLED },
          scheduledStart: { gte: weekRange.start, lt: weekRange.end },
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          technicianId: user.id,
          status: RequestStatus.COMPLETED,
          OR: [
            { completedAt: { gte: weekRange.start, lt: weekRange.end } },
            {
              completedAt: null,
              scheduledStart: { gte: weekRange.start, lt: weekRange.end },
            },
          ],
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          technicianId: user.id,
          status: RequestStatus.COMPLETED,
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          technicianId: user.id,
          status: RequestStatus.SCHEDULED,
        },
      }),
    ]);

    return {
      firstName: profile?.firstName ?? '',
      jobsToday,
      inProgress,
      completedThisMonth,
      weeklyTasks,
      completedThisWeek,
      totalCompleted,
      upcoming,
      averageRating: Number(profile?.technician?.rating ?? 0),
      date,
      timezone: today.timezone,
    };
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localDateString(now: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
