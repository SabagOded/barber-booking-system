import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BookingFlow,
  rejectedAvailabilityScope,
  STALE_DAY_ERROR,
} from "./BookingFlow";
import type { DayOption } from "../actions";

const settings = {
  businessName: "שם עסק ארוך במיוחד לבדיקת שבירת שורה",
  providerName: "נותן השירות",
  phone: "0501234567",
  whatsappPhone: "0501234567",
  address: "",
  calendarNote: "",
  tagline: "תיאור ארוך בעברית שנשבר באופן טבעי גם במסך נייד צר",
  timezone: "Asia/Jerusalem",
};

describe("public booking flow landing", () => {
  it("collapses optional visit and portfolio sections when their data is missing", () => {
    const html = renderToStaticMarkup(
      <BookingFlow settings={settings} services={[]} hoursParts={[]} />,
    );

    expect(html).not.toContain("id=\"visit-heading\"");
    expect(html).not.toContain("id=\"portfolio-heading\"");
    expect(html).toContain("id=\"how-heading\"");
    expect(html).toContain("קביעת תור");
  });

  it("keeps long Hebrew brand content intact", () => {
    const html = renderToStaticMarkup(
      <BookingFlow settings={settings} services={[]} hoursParts={[]} />,
    );

    expect(html).toContain(settings.businessName);
    expect(html).toContain(settings.tagline);
    expect(html).toContain("max-w-[13ch]");
  });

  it("renders an active home notice once in the hero before visit details", () => {
    const notice = "החנות תהיה סגורה בערב החג";
    const html = renderToStaticMarkup(
      <BookingFlow
        settings={settings}
        services={[]}
        hoursParts={["ראשון–חמישי 09:00–18:00"]}
        doorNotice={notice}
      />,
    );

    expect(html.match(new RegExp(notice, "g"))).toHaveLength(1);
    expect(html.indexOf("יש לי תור · בקשת ביטול")).toBeLessThan(html.indexOf(notice));
    expect(html.indexOf(notice)).toBeLessThan(html.indexOf('id="visit-heading"'));
  });
});

describe("stale booking availability", () => {
  const loadedDay: DayOption = {
    date: "2026-09-24",
    weekday: "יום חמישי",
    dayMonth: "24.9",
    dayNumber: "24",
    weekdayIndex: 4,
    monthKey: "2026-09",
    isToday: false,
    available: true,
    occupancy: "open",
  };

  it("returns to day selection when a previously available date was closed", () => {
    expect(rejectedAvailabilityScope([loadedDay], loadedDay.date)).toBe("slot");

    const refreshedDays = [{ ...loadedDay, available: false, occupancy: "closed" as const }];
    expect(rejectedAvailabilityScope(refreshedDays, loadedDay.date)).toBe("day");
    expect(STALE_DAY_ERROR).toBe("התאריך הזה כבר לא זמין. בחרו תאריך אחר.");
  });
});
