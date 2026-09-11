const DATE_RE = /^(\d{4,6})-(\d{2})-(\d{2})$/;

const floorDiv = (value, divisor) => Math.floor(value / divisor);

export const isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseCalendarDate(value) {
  const match = DATE_RE.exec(String(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatCalendarDate({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayCalendarDate(now = new Date()) {
  return formatCalendarDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  });
}

export function normalizeCalendarDate(value, fallback) {
  const parsed = parseCalendarDate(value);
  return parsed ? formatCalendarDate(parsed) : fallback;
}

function dayNumber({ year, month, day }) {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = floorDiv(adjustedYear, 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = floorDiv(153 * shiftedMonth + 2, 5) + day - 1;
  return era * 146097 + yearOfEra * 365 + floorDiv(yearOfEra, 4)
    - floorDiv(yearOfEra, 100) + dayOfYear;
}

function dateFromDayNumber(value) {
  const era = floorDiv(value, 146097);
  const dayOfEra = value - era * 146097;
  const yearOfEra = floorDiv(dayOfEra - floorDiv(dayOfEra, 1460)
    + floorDiv(dayOfEra, 36524) - floorDiv(dayOfEra, 146096), 365);
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + floorDiv(yearOfEra, 4) - floorDiv(yearOfEra, 100));
  const monthPart = floorDiv(5 * dayOfYear + 2, 153);
  const day = dayOfYear - floorDiv(153 * monthPart + 2, 5) + 1;
  const month = monthPart + (monthPart < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

export function daysBetween(start, end) {
  const a = parseCalendarDate(start);
  const b = parseCalendarDate(end);
  return a && b ? dayNumber(b) - dayNumber(a) : 0;
}

export function addCalendarStep(value, amount, unit) {
  const parsed = parseCalendarDate(value);
  if (!parsed || !Number.isInteger(amount)) return value;

  if (unit === "day") {
    const next = dateFromDayNumber(dayNumber(parsed) + amount);
    return next.year >= 1 && next.year <= 999999 ? formatCalendarDate(next) : value;
  }

  if (unit === "month") {
    const absoluteMonth = parsed.year * 12 + parsed.month - 1 + amount;
    const year = floorDiv(absoluteMonth, 12);
    const month = absoluteMonth - year * 12 + 1;
    if (year < 1 || year > 999999) return value;
    return formatCalendarDate({ year, month, day: Math.min(parsed.day, daysInMonth(year, month)) });
  }

  if (unit === "year") {
    const year = parsed.year + amount;
    if (year < 1 || year > 999999) return value;
    return formatCalendarDate({ year, month: parsed.month, day: Math.min(parsed.day, daysInMonth(year, parsed.month)) });
  }

  return value;
}

export function replaceCalendarPart(value, part, rawValue) {
  const parsed = parseCalendarDate(value);
  const number = Number.parseInt(String(rawValue).replace(/\D/g, ""), 10);
  if (!parsed || !Number.isFinite(number)) return value;

  const next = { ...parsed };
  if (part === "year") next.year = Math.max(1, Math.min(999999, number));
  else if (part === "month") next.month = Math.max(1, Math.min(12, number));
  else if (part === "day") next.day = Math.max(1, number);
  else return value;

  next.day = Math.min(next.day, daysInMonth(next.year, next.month));
  return formatCalendarDate(next);
}
