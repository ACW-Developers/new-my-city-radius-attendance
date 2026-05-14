// Arizona timezone utility - all dates/times in the system use America/Phoenix
export const TIMEZONE = 'America/Phoenix';

export function nowInAZ(): Date {
  // Returns a Date object representing "now" but we use it with toLocaleString for display
  return new Date();
}

export function formatTimeAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

export function formatDateAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatDateShortAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { timeZone: TIMEZONE, month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTimeAZ(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { timeZone: TIMEZONE, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function getTodayDateStringAZ(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).formatToParts(new Date());
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
