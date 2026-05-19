// Arizona timezone utility - all dates/times in the system use America/Phoenix
export const TIMEZONE = 'America/Phoenix';

export function nowInAZ(): Date {
  return new Date();
}

export function formatTimeAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

// 24h HH:MM in AZ, useful for <input type="time">
export function formatTimeAZ24(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatDateShortAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { timeZone: TIMEZONE, month: 'short', day: 'numeric', year: 'numeric' });
}

// "Mon, Jan 5"
export function formatDateWeekdayShortAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDateTimeAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { timeZone: TIMEZONE, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Full "Jan 5, 2025, 03:45 PM"
export function formatDateTimeFullAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { timeZone: TIMEZONE, month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// YYYY-MM-DD in AZ for "today"
export function getTodayDateStringAZ(): string {
  return toAZDateString(new Date());
}

// YYYY-MM-DD in AZ for any Date
export function toAZDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

export function getCurrentHourAZ(): number {
  const str = new Date().toLocaleString('en-US', { timeZone: TIMEZONE, hour: 'numeric', hour12: false });
  return parseInt(str, 10);
}

export function getAZDateFromISO(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}
