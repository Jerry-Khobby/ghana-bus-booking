import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;
const PRESET_DAYS = { today: 1, '7d': 7, '30d': 30 } as const;

export type RangePreset = keyof typeof PRESET_DAYS;

/** The days a report covers: [start, end) in UTC, which is Ghana time. */
export interface ReportRange {
  /** First day, YYYY-MM-DD. */
  from: string;
  /** Last day, YYYY-MM-DD (inclusive). */
  to: string;
  start: Date;
  /** Midnight after the last day. */
  end: Date;
  days: number;
}

/**
 * `range=today|7d|30d` (ending today), or `from`/`to` (inclusive). Defaults
 * to the last 7 days. At most a year, so a report can't scan everything.
 */
export function resolveRange(
  query: { range?: RangePreset; from?: string; to?: string },
  now = new Date(),
): ReportRange {
  const today = now.toISOString().slice(0, 10);
  let from: string;
  let to: string;
  if (query.from || query.to) {
    from = query.from ?? query.to!;
    to = query.to ?? today;
  } else {
    const days = PRESET_DAYS[query.range ?? '7d'];
    to = today;
    from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * DAY_MS)
      .toISOString()
      .slice(0, 10);
  }

  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days < 1) {
    throw invalid('to', 'to must be on or after from');
  }
  if (days > MAX_DAYS) {
    throw invalid('from', `A report covers at most ${MAX_DAYS} days`);
  }
  return { from, to, start, end, days };
}

function invalid(field: string, message: string) {
  return new AppException(
    'VALIDATION_FAILED',
    'Some fields are invalid',
    HttpStatus.BAD_REQUEST,
    { fields: { [field]: [message] } },
  );
}
