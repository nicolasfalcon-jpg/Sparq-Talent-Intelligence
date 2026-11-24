/** Business-date helpers. Dates are ISO `YYYY-MM-DD` strings handled in UTC to avoid timezone drift. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

/** "Jan 5" */
export function formatShortDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Jan 5, 2027" */
export function formatLongDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Tuesday, November 24" */
export function formatWeekdayDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** { day: "12", month: "Jan" } for kick-off tiles. */
export function dayAndMonth(iso: string): { day: string; month: string } {
  const d = parseIsoDate(iso);
  return { day: String(d.getUTCDate()), month: MONTHS[d.getUTCMonth()] ?? "" };
}

/** Last day of the month that contains `iso`. */
export function endOfMonth(iso: string): string {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
