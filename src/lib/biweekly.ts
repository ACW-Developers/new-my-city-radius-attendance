// Centralized biweekly period logic.
import { formatDateShortAZ } from './timezone';

export interface BiweeklyPeriod {
  start: Date;
  end: Date;
  index: number;
  startISO: string;
  endISO: string;
}

const PERIOD_DAYS = 14;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseAnchor(anchor: string | undefined | null): Date {
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    const [y, m, d] = anchor.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const fallback = new Date();
  fallback.setHours(0, 0, 0, 0);
  while (fallback.getDay() !== 1) fallback.setDate(fallback.getDate() - 1);
  return fallback;
}

export function getBiweeklyPeriod(anchor: string | undefined | null, ref: Date = new Date()): BiweeklyPeriod {
  const anchorDate = parseAnchor(anchor);
  anchorDate.setHours(0, 0, 0, 0);
  const refDate = new Date(ref);
  refDate.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((refDate.getTime() - anchorDate.getTime()) / dayMs);
  const index = Math.floor(diffDays / PERIOD_DAYS);
  const start = new Date(anchorDate);
  start.setDate(start.getDate() + index * PERIOD_DAYS);
  const end = new Date(start);
  end.setDate(end.getDate() + PERIOD_DAYS - 1);
  return {
    start, end,
    index: Math.max(0, index),
    startISO: toISODate(start),
    endISO: toISODate(end),
  };
}

export function getBiweeklyPeriodByOffset(anchor: string | undefined | null, offset: number): BiweeklyPeriod {
  const ref = new Date();
  ref.setDate(ref.getDate() + offset * PERIOD_DAYS);
  return getBiweeklyPeriod(anchor, ref);
}

export function formatPeriodLabel(p: BiweeklyPeriod): string {
  return `${formatDateShortAZ(p.start)} - ${formatDateShortAZ(p.end)}`;
}
