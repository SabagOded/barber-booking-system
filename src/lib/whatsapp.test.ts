import { describe, expect, it } from "vitest";
import {
  buildWhatsAppBlankCancelUrl,
  buildWhatsAppCancelUrl,
  buildWhatsAppCustomerUrl,
  buildWhatsAppRescheduleConfirmUrl,
  buildWhatsAppWalkInConfirmUrl,
} from "./whatsapp";


describe("WhatsApp cancel URLs", () => {
  it("strips + from wa.me digits and prefills a cancel request", () => {
    const href = buildWhatsAppCancelUrl({
      whatsappPhone: "054-1234567",
      customerName: "דוד כהן",
      serviceName: "שירות מורחב",
      dateLabel: "יום שני 14.9",
      timeLabel: "17:00",
    });
    expect(href.startsWith("https://wa.me/972541234567?text=")).toBe(true);
    expect(href).not.toContain("wa.me/+");
    const text = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(text).toContain("בקשת ביטול");
    expect(text).toContain("דוד כהן");
    expect(text).toContain("שירות מורחב");
    expect(text).toContain("יום שני 14.9");
    expect(text).toContain("17:00");
  });

  it("blank template has empty lines for name, phone, when, and service", () => {
    const href = buildWhatsAppBlankCancelUrl("054-1234567");
    const text = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(href).toContain("wa.me/972541234567");
    expect(text).toContain("שם:");
    expect(text).toContain("טלפון:");
    expect(text).toContain("תאריך ושעה:");
    expect(text).toContain("שירות:");
  });

  it("walk-in confirm goes to the customer mobile as wa.me digits", () => {
    const href = buildWhatsAppWalkInConfirmUrl({
      customerPhone: "0501234567",
      customerName: "דוד כהן",
      weekday: "יום שני",
      dateLabel: "14 בספטמבר 2026",
      timeLabel: "12:30",
      serviceName: "שירות",
    });
    expect(href.startsWith("https://wa.me/972501234567?text=")).toBe(true);
    const text = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(text).toContain("שלום דוד כהן");
    expect(text).toContain("יום שני");
    expect(text).toContain("14 בספטמבר 2026");
    expect(text).toContain("12:30");
    expect(text).toContain("שירות");
  });

  it("reschedule confirm prefills the moved appointment details", () => {
    const href = buildWhatsAppRescheduleConfirmUrl({
      customerPhone: "0501234567",
      customerName: "דוד כהן",
      weekday: "יום שלישי",
      dateLabel: "15 בספטמבר 2026",
      timeLabel: "14:00",
      serviceName: "שירות",
    });
    expect(href.startsWith("https://wa.me/972501234567?text=")).toBe(true);
    const text = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(text).toContain("שלום דוד כהן");
    expect(text).toContain("הועבר");
    expect(text).toContain("יום שלישי");
    expect(text).toContain("15 בספטמבר 2026");
    expect(text).toContain("14:00");
    expect(text).toContain("שירות");
  });

  it("opens a blank customer chat using international Israeli digits", () => {
    expect(buildWhatsAppCustomerUrl("0501234567")).toBe("https://wa.me/972501234567");
  });
});
