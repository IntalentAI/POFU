const DAY = 86_400_000;

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * DAY);
}

export function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole calendar days from `from` to `to` (date parts only). */
export function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDayUTC(to).getTime() - startOfDayUTC(from).getTime()) / DAY);
}

/** Hour (0-23) of `d` in the given IANA time zone. */
export function hourInZone(d: Date, timeZone: string) {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(d);
  return Number(h);
}

/** Offset (ms) of a time zone from UTC at instant `d`. */
function zoneOffset(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - d.getTime();
}

/** The instant at `hour`:00 local time in `timeZone` on the calendar day of `day` (UTC date parts). */
export function atLocalHour(day: Date, hour: number, timeZone: string) {
  const naive = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour);
  const offset = zoneOffset(new Date(naive), timeZone);
  return new Date(naive - offset);
}

/** e.g. "9:00 AM" for hour 9. */
export function fmtHour(hour: number) {
  return `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;
}

export function isQuietHour(d: Date, timeZone: string, start: number, end: number) {
  const h = hourInZone(d, timeZone);
  return start > end ? h >= start || h < end : h >= start && h < end;
}

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC", ...opts });
}

/** A moment in time, shown in the workspace's time zone (the server runs in UTC). */
export function fmtDateTime(d: Date | string | null | undefined, timeZone = "UTC") {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
}

export function relative(d: Date | string, now = new Date()) {
  const days = daysBetween(new Date(d), now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  return days > 0 ? `${days} days ago` : `in ${-days} days`;
}

/** Parse YYYY-MM-DD as a UTC date (joining dates are calendar dates). */
export function parseDateOnly(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export function toDateInput(d: Date) {
  return startOfDayUTC(d).toISOString().slice(0, 10);
}
