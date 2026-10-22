import { BadRequestException } from '@nestjs/common';

type CalendarDate = { year: number; month: number; day: number };

export function adminUtcRange(from?: string, to?: string, zone?: string) {
  if (!from || !to) {
    throw new BadRequestException('from and to are required');
  }
  const timezone = zone ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException('timezone must be a valid IANA timezone');
  }
  const startDate = parseDate(from);
  const endDate = parseDate(to);
  if (
    Date.UTC(startDate.year, startDate.month - 1, startDate.day) >
    Date.UTC(endDate.year, endDate.month - 1, endDate.day)
  ) {
    throw new BadRequestException('from must be on or before to');
  }
  return {
    timezone,
    start: toUtc(startDate, timezone),
    end: toUtc(addDays(endDate, 1), timezone),
  };
}

export function adminPreviousUtcRange(
  from: string,
  to: string,
  timezone?: string,
) {
  const startDate = parseDate(from);
  const endDate = parseDate(to);
  const dayCount =
    (Date.UTC(endDate.year, endDate.month - 1, endDate.day) -
      Date.UTC(startDate.year, startDate.month - 1, startDate.day)) /
      86_400_000 +
    1;
  const previousTo = formatDate(addDays(startDate, -1));
  const previousFrom = formatDate(addDays(startDate, -dayCount));
  return {
    from: previousFrom,
    to: previousTo,
    ...adminUtcRange(previousFrom, previousTo, timezone),
  };
}

export function adminLocalWeekRange(date: string, timezone?: string) {
  const parsed = parseDate(date);
  const weekday = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  ).getUTCDay();
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = addDays(parsed, offsetToMonday);
  const sunday = addDays(monday, 6);
  return adminUtcRange(formatDate(monday), formatDate(sunday), timezone);
}

export function adminLocalTodayRange(timezone?: string) {
  const tz = timezone ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format();
  } catch {
    throw new BadRequestException('timezone must be a valid IANA timezone');
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return adminUtcRange(date, date, tz);
}

function parseDate(value: string): CalendarDate {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException('date values must be valid calendar dates');
  }
  return { year, month, day };
}

function formatDate(value: CalendarDate) {
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function addDays(value: CalendarDate, days: number): CalendarDate {
  const date = new Date(
    Date.UTC(value.year, value.month - 1, value.day + days),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function toUtc(value: CalendarDate, timezone: string): Date {
  const target = Date.UTC(value.year, value.month - 1, value.day);
  let result = target - offsetAt(new Date(target), timezone);
  const corrected = offsetAt(new Date(result), timezone);
  if (corrected !== target - result) result = target - corrected;
  return new Date(result);
}

function offsetAt(date: Date, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - date.getTime()
  );
}
