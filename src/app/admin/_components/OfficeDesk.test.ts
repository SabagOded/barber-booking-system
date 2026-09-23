import { describe, expect, it } from "vitest";
import {
  blockEndChoices,
  buildWalkInConfirmationHref,
  canRescheduleAppointment,
  findNowMarkerSlotId,
  getShopDayStatus,
  nextRescheduleStep,
  requiresMissingPhoneConfirmation,
  visibleSlotsForDate,
  walkInFailureMessage,
  type DeskSlot,
} from "./OfficeDesk";

describe("manual appointment phone flow", () => {
  it("requires a second confirmation only when the phone is empty", () => {
    expect(requiresMissingPhoneConfirmation("  ")).toBe(true);
    expect(requiresMissingPhoneConfirmation("0501234567")).toBe(false);
  });

  it("does not create a WhatsApp confirmation URL without a phone", () => {
    expect(buildWalkInConfirmationHref({
      customerPhone: null,
      customerName: "דוד כהן",
      weekday: "יום שני",
      dateLabel: "14 בספטמבר",
      timeLabel: "10:00",
      serviceName: "תספורת",
    })).toBeNull();
  });

  it("shows the actual server failure while confirming a booking without a phone", () => {
    expect(walkInFailureMessage("slot_unavailable")).toContain("לא פנויה");
    expect(walkInFailureMessage("demo_limit")).toContain("מגבלת התורים");
    expect(walkInFailureMessage("unauthenticated")).toContain("החיבור לאדמין פג");
    expect(walkInFailureMessage("generic")).toContain("לא הצלחנו לשמור");
  });
});

describe("appointment action visibility", () => {
  it("shows rescheduling only for eligible future scheduled appointments", () => {
    expect(canRescheduleAppointment({ status: "scheduled", canReschedule: true })).toBe(true);
    expect(canRescheduleAppointment({ status: "scheduled", canReschedule: false })).toBe(false);
    expect(canRescheduleAppointment({ status: "cancelled", canReschedule: true })).toBe(false);
    expect(canRescheduleAppointment({ status: "completed", canReschedule: true })).toBe(false);
  });

  it("runs the choose, confirm, success flow and returns to choose after rejection", () => {
    expect(nextRescheduleStep("choose", "continue")).toBe("confirm");
    expect(nextRescheduleStep("confirm", "back")).toBe("choose");
    expect(nextRescheduleStep("confirm", "rejected")).toBe("choose");
    expect(nextRescheduleStep("confirm", "saved")).toBe("success");
  });
});

function slot(startLabel: string, kind: DeskSlot["kind"]): DeskSlot {
  const startAt = new Date(`2026-09-14T${startLabel}:00+03:00`);
  const [hours, minutes] = startLabel.split(":").map(Number);
  const totalMinutes = hours! * 60 + minutes! + 30;
  return {
    startLabel,
    endLabel: `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`,
    startAtIso: startAt.toISOString(),
    endAtIso: new Date(startAt.getTime() + 30 * 60 * 1000).toISOString(),
    kind,
    past: false,
  };
}

describe("historical day slot visibility", () => {
  const slots = [slot("09:00", "free"), slot("09:30", "past"), slot("10:00", "booked"), slot("10:30", "blocked")];

  it("keeps booked and blocked activity while hiding empty historical slots", () => {
    expect(visibleSlotsForDate(slots, "2026-09-13", "2026-09-14").map((item) => item.kind)).toEqual([
      "booked",
      "blocked",
    ]);
  });

  it("keeps every slot for today, including elapsed slots", () => {
    expect(visibleSlotsForDate(slots, "2026-09-14", "2026-09-14")).toBe(slots);
  });

  it("keeps every slot for a future date", () => {
    expect(visibleSlotsForDate(slots, "2026-09-15", "2026-09-14")).toBe(slots);
  });
});

describe("block end choices", () => {
  it("stops at the first existing block instead of appending shop closing", () => {
    const slots = [
      slot("12:00", "free"),
      slot("12:30", "free"),
      slot("13:00", "blocked"),
      slot("13:30", "blocked"),
      slot("18:30", "free"),
    ];

    expect(blockEndChoices(slots, slots[0]!)).toEqual([
      { iso: slots[0]!.endAtIso, label: "12:30" },
      { iso: slots[2]!.startAtIso, label: "13:00" },
    ]);
  });

  it("returns exactly 12:30 and 13:00 for a 12:00 start before a 13:00-14:00 block", () => {
    const slots = [
      slot("12:00", "free"),
      slot("12:30", "free"),
      slot("13:00", "blocked"),
      slot("13:30", "blocked"),
      slot("18:30", "free"),
    ];

    const choices = blockEndChoices(slots, slots[0]!);

    expect(choices.map((choice) => choice.label)).toEqual(["12:30", "13:00"]);
    expect(choices.map((choice) => choice.label)).not.toContain("19:00");
  });
});

describe("findNowMarkerSlotId", () => {
  const shopHours = { isOpen: true as const, openTime: "09:00", closeTime: "19:00" };
  const daySlots = [
    slot("09:00", "free"),
    slot("09:30", "free"),
    slot("12:00", "booked"),
    slot("12:30", "free"),
    slot("18:00", "free"),
    slot("18:30", "free"),
  ];

  it("returns null after closing time (no 'עכשיו' marker or jump-to-now)", () => {
    // Exactly at closing
    expect(findNowMarkerSlotId(daySlots, "19:00", shopHours)).toBeNull();
    // After closing time - does not fall back to the last historical slot
    expect(findNowMarkerSlotId(daySlots, "19:01", shopHours)).toBeNull();
    expect(findNowMarkerSlotId(daySlots, "19:30", shopHours)).toBeNull();
    expect(findNowMarkerSlotId(daySlots, "22:15", shopHours)).toBeNull();
  });

  it("returns null before opening time (no 'עכשיו' marker or jump-to-now)", () => {
    expect(findNowMarkerSlotId(daySlots, "06:00", shopHours)).toBeNull();
    expect(findNowMarkerSlotId(daySlots, "08:45", shopHours)).toBeNull();
    expect(findNowMarkerSlotId(daySlots, "08:59", shopHours)).toBeNull();
  });

  it("preserves existing 'עכשיו' behavior within opening hours", () => {
    // At opening
    expect(findNowMarkerSlotId(daySlots, "09:00", shopHours)).toBe(daySlots[0]!.startAtIso);
    // Midday (aligned to 2-column row in afternoon group)
    expect(findNowMarkerSlotId(daySlots, "12:15", shopHours)).toBe(daySlots[2]!.startAtIso);
    // During the last slot of the day before closing (aligned to 2-column row in evening group)
    expect(findNowMarkerSlotId(daySlots, "18:40", shopHours)).toBe(daySlots[4]!.startAtIso);
  });

  it("returns null on a closed day", () => {
    expect(findNowMarkerSlotId(daySlots, "12:00", { isOpen: false })).toBeNull();
  });
});

describe("getShopDayStatus", () => {
  const openHours = { isOpen: true as const, openTime: "09:00", closeTime: "19:00" };

  describe("when selected date is TODAY", () => {
    it("reports 'פתוח · 09:00-19:00' with green status dot during opening hours", () => {
      const status = getShopDayStatus(true, openHours, "14:00");
      expect(status.isToday).toBe(true);
      expect(status.isOpenNow).toBe(true);
      expect(status.statusLabel).toBe("פתוח");
      expect(status.hoursRange).toBe("09:00–19:00");
      expect(status.indicatorColor).toBe("ok");
    });

    it("reports 'סגור · 09:00-19:00' with red status dot after closing", () => {
      const status = getShopDayStatus(true, openHours, "19:30");
      expect(status.isToday).toBe(true);
      expect(status.isOpenNow).toBe(false);
      expect(status.statusLabel).toBe("סגור");
      expect(status.hoursRange).toBe("09:00–19:00");
      expect(status.indicatorColor).toBe("danger");
    });

    it("reports 'סגור · 09:00-19:00' with red status dot before opening", () => {
      const status = getShopDayStatus(true, openHours, "07:45");
      expect(status.isToday).toBe(true);
      expect(status.isOpenNow).toBe(false);
      expect(status.statusLabel).toBe("סגור");
      expect(status.hoursRange).toBe("09:00–19:00");
      expect(status.indicatorColor).toBe("danger");
    });

    it("reports 'סגור' with red status dot if today is closed for the entire day", () => {
      const status = getShopDayStatus(true, { isOpen: false }, "12:00");
      expect(status.isToday).toBe(true);
      expect(status.isOpenNow).toBe(false);
      expect(status.statusLabel).toBe("סגור");
      expect(status.hoursRange).toBeNull();
      expect(status.indicatorColor).toBe("danger");
    });
  });

  describe("when selected date is NOT today (past or future)", () => {
    it("shows only configured hours without 'פתוח' and without status dot for an open past day", () => {
      const status = getShopDayStatus(false, openHours, "14:00");
      expect(status.isToday).toBe(false);
      expect(status.statusLabel).toBeNull(); // No "פתוח"
      expect(status.indicatorColor).toBeNull(); // No dot
      expect(status.hoursRange).toBe("09:00–19:00");
    });

    it("shows only configured hours without 'פתוח' and without status dot for an open future day", () => {
      const status = getShopDayStatus(false, openHours, "22:00");
      expect(status.isToday).toBe(false);
      expect(status.statusLabel).toBeNull(); // No "פתוח"
      expect(status.indicatorColor).toBeNull(); // No dot
      expect(status.hoursRange).toBe("09:00–19:00");
    });

    it("shows 'סגור' without status dot for a fully closed past/future day", () => {
      const status = getShopDayStatus(false, { isOpen: false }, "12:00");
      expect(status.isToday).toBe(false);
      expect(status.statusLabel).toBe("סגור");
      expect(status.hoursRange).toBeNull();
      expect(status.indicatorColor).toBeNull(); // No dot
    });
  });
});
