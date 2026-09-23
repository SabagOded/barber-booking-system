export function toUtcStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid calendar instant");
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs(input: {
  title: string;
  description: string;
  startAtIso: string;
  endAtIso: string;
  uid: string;
  location?: string;
}): string {
  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

  const eventLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//appointment-booking//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${toUtcStamp(new Date().toISOString())}`,
    `DTSTART:${toUtcStamp(input.startAtIso)}`,
    `DTEND:${toUtcStamp(input.endAtIso)}`,
    `SUMMARY:${escape(input.title)}`,
    `DESCRIPTION:${escape(input.description)}`,
  ];
  const location = input.location?.trim();
  if (location) {
    eventLines.push(`LOCATION:${escape(location)}`);
  }

  return [
    ...eventLines,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function googleEventDetails(input: {
  calendarNote?: string | null;
  shopName: string;
  address?: string | null;
  phone?: string | null;
}): string {
  const note = (input.calendarNote ?? "").trim();
  if (note) {
    return note;
  }
  return [input.shopName, (input.address ?? "").trim(), (input.phone ?? "").trim()]
    .filter(Boolean)
    .join("\n");
}

export function googleCalendarTemplateUrl(input: {
  title: string;
  description: string;
  startAtIso: string;
  endAtIso: string;
  location?: string;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${toUtcStamp(input.startAtIso)}/${toUtcStamp(input.endAtIso)}`,
    details: input.description,
  });
  const location = input.location?.trim();
  if (location) {
    params.set("location", location);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
