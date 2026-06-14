export type MarketSession =
  | "PRE_MARKET"
  | "REGULAR"
  | "AFTER_HOURS"
  | "CLOSED"
  | "HOLIDAY"
  | "EARLY_CLOSE"
  | "UNKNOWN";

export interface MarketSessionCalendar {
  holidays?: readonly string[];
  earlyCloses?: Readonly<Record<string, string>>;
}

interface NewYorkParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  dateKey: string;
  minutesSinceMidnight: number;
}

const NEW_YORK_TIME_ZONE = "America/New_York";
const PRE_MARKET_OPEN_MINUTES = 4 * 60;
const REGULAR_OPEN_MINUTES = 9 * 60 + 30;
const REGULAR_CLOSE_MINUTES = 16 * 60;
const AFTER_HOURS_CLOSE_MINUTES = 20 * 60;
const MAX_LOOKAHEAD_DAYS = 370;

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NEW_YORK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23"
});

export function classifySession(
  timestampUtc: Date | string | number,
  calendar: MarketSessionCalendar | undefined
): MarketSession {
  const date = toValidDate(timestampUtc);
  if (!date || !isCalendarUsable(calendar)) {
    return "UNKNOWN";
  }

  const parts = getNewYorkParts(date);
  if (!parts) {
    return "UNKNOWN";
  }

  if (isHoliday(parts.dateKey, calendar)) {
    return "HOLIDAY";
  }

  if (isWeekend(parts.weekday)) {
    return "CLOSED";
  }

  const closeMinutes = getCloseMinutes(parts.dateKey, calendar);
  if (closeMinutes === undefined) {
    return "UNKNOWN";
  }

  const currentMinutes = parts.minutesSinceMidnight;
  if (currentMinutes >= PRE_MARKET_OPEN_MINUTES && currentMinutes < REGULAR_OPEN_MINUTES) {
    return "PRE_MARKET";
  }

  if (currentMinutes >= REGULAR_OPEN_MINUTES && currentMinutes < closeMinutes) {
    return "REGULAR";
  }

  if (closeMinutes < REGULAR_CLOSE_MINUTES && currentMinutes >= closeMinutes && currentMinutes < AFTER_HOURS_CLOSE_MINUTES) {
    return "EARLY_CLOSE";
  }

  if (currentMinutes >= REGULAR_CLOSE_MINUTES && currentMinutes < AFTER_HOURS_CLOSE_MINUTES) {
    return "AFTER_HOURS";
  }

  return "CLOSED";
}

export function isRegularSession(
  timestampUtc: Date | string | number,
  calendar: MarketSessionCalendar | undefined
): boolean {
  return classifySession(timestampUtc, calendar) === "REGULAR";
}

export function nextOpen(
  timestampUtc: Date | string | number,
  calendar: MarketSessionCalendar | undefined
): Date | null {
  const date = toValidDate(timestampUtc);
  if (!date || !isCalendarUsable(calendar)) {
    return null;
  }

  const parts = getNewYorkParts(date);
  if (!parts) {
    return null;
  }

  for (let dayOffset = 0; dayOffset <= MAX_LOOKAHEAD_DAYS; dayOffset += 1) {
    const candidateNoon = addUtcDays(localNewYorkDateTimeToUtc(parts.year, parts.month, parts.day, 12, 0), dayOffset);
    const candidateParts = getNewYorkParts(candidateNoon);
    if (!candidateParts || !isTradingDay(candidateParts.dateKey, candidateParts.weekday, calendar)) {
      continue;
    }

    const open = localNewYorkDateTimeToUtc(candidateParts.year, candidateParts.month, candidateParts.day, 9, 30);
    if (open > date) {
      return open;
    }
  }

  return null;
}

export function nextClose(
  timestampUtc: Date | string | number,
  calendar: MarketSessionCalendar | undefined
): Date | null {
  const date = toValidDate(timestampUtc);
  if (!date || !isCalendarUsable(calendar)) {
    return null;
  }

  const parts = getNewYorkParts(date);
  if (!parts) {
    return null;
  }

  for (let dayOffset = 0; dayOffset <= MAX_LOOKAHEAD_DAYS; dayOffset += 1) {
    const candidateNoon = addUtcDays(localNewYorkDateTimeToUtc(parts.year, parts.month, parts.day, 12, 0), dayOffset);
    const candidateParts = getNewYorkParts(candidateNoon);
    if (!candidateParts || !isTradingDay(candidateParts.dateKey, candidateParts.weekday, calendar)) {
      continue;
    }

    const closeMinutes = getCloseMinutes(candidateParts.dateKey, calendar);
    if (closeMinutes === undefined) {
      return null;
    }

    const close = localNewYorkDateTimeToUtc(
      candidateParts.year,
      candidateParts.month,
      candidateParts.day,
      Math.floor(closeMinutes / 60),
      closeMinutes % 60
    );
    if (close > date) {
      return close;
    }
  }

  return null;
}

function toValidDate(input: Date | string | number): Date | null {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isCalendarUsable(calendar: MarketSessionCalendar | undefined): calendar is MarketSessionCalendar {
  return typeof calendar === "object" && calendar !== null;
}

function getNewYorkParts(date: Date): NewYorkParts | null {
  const values = new Map<string, string>();
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      values.set(part.type, part.value);
    }
  }

  const year = Number(values.get("year"));
  const month = Number(values.get("month"));
  const day = Number(values.get("day"));
  const hour = Number(values.get("hour"));
  const minute = Number(values.get("minute"));
  const weekday = values.get("weekday");

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(hour) || !Number.isInteger(minute) || !weekday) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minutesSinceMidnight: hour * 60 + minute
  };
}

function localNewYorkDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getNewYorkParts(guess);
    if (!actual) {
      break;
    }

    const requestedUtcMinutes = Date.UTC(year, month - 1, day, hour, minute) / 60_000;
    const actualWallClockUtcMinutes = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute) / 60_000;
    const deltaMinutes = requestedUtcMinutes - actualWallClockUtcMinutes;
    if (deltaMinutes === 0) {
      return guess;
    }

    guess = new Date(guess.getTime() + deltaMinutes * 60_000);
  }

  return guess;
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isHoliday(dateKey: string, calendar: MarketSessionCalendar): boolean {
  return calendar.holidays?.includes(dateKey) ?? false;
}

function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

function isTradingDay(dateKey: string, weekday: string, calendar: MarketSessionCalendar): boolean {
  return !isWeekend(weekday) && !isHoliday(dateKey, calendar);
}

function getCloseMinutes(dateKey: string, calendar: MarketSessionCalendar): number | undefined {
  const earlyClose = calendar.earlyCloses?.[dateKey];
  if (earlyClose === undefined) {
    return REGULAR_CLOSE_MINUTES;
  }

  return parseTimeToMinutes(earlyClose);
}

function parseTimeToMinutes(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return undefined;
  }

  return hours * 60 + minutes;
}
