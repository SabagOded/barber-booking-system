const HEBREW_DATE_FORMATTER = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats a YYYY-MM-DD calendar date without letting the host timezone shift the day. */
export function formatHebrewCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  return HEBREW_DATE_FORMATTER.format(date);
}
