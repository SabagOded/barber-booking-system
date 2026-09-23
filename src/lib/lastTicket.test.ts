import { describe, expect, it } from "vitest";
import { isUpcomingTicket, parseLastTicket } from "./lastTicket";

describe("last ticket parse", () => {
  it("returns null for corrupt JSON, missing startAt, or invalid instant", () => {
    expect(parseLastTicket("not-json")).toBeNull();
    expect(parseLastTicket('{"customerName":"דוד כהן"}')).toBeNull();
    expect(
      parseLastTicket(
        JSON.stringify({
          customerName: "דוד כהן",
          serviceName: "שירות",
          shopName: "שם העסק",
          startAt: "not-a-date",
        }),
      ),
    ).toBeNull();
  });

  it("hides a ticket whose startAt is already in the past", () => {
    const ticket = parseLastTicket(
      JSON.stringify({
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceName: "שירות מורחב",
        shopName: "שם העסק",
        startAt: "2020-01-01T08:00:00.000Z",
        endAt: "2020-01-01T08:30:00.000Z",
      }),
    );
    expect(ticket).not.toBeNull();
    expect(isUpcomingTicket(ticket!, new Date("2026-09-11T10:00:00.000Z"))).toBe(false);
  });

  it("keeps appointmentId when present and omits it on the old shape", () => {
    const withId = parseLastTicket(
      JSON.stringify({
        appointmentId: "appt_123",
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceName: "שירות",
        shopName: "שם העסק",
        startAt: "2026-09-14T14:00:00.000Z",
        endAt: "2026-09-14T14:30:00.000Z",
      }),
    );
    expect(withId?.appointmentId).toBe("appt_123");

    const legacy = parseLastTicket(
      JSON.stringify({
        customerName: "דוד כהן",
        customerPhone: "0501234567",
        serviceName: "שירות",
        shopName: "שם העסק",
        startAt: "2026-09-14T14:00:00.000Z",
        endAt: "2026-09-14T14:30:00.000Z",
      }),
    );
    expect(legacy?.appointmentId).toBeUndefined();
  });
});
