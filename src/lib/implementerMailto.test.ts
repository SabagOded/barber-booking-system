import { describe, expect, it } from "vitest";
import {
  IMPLEMENTER_RESET_SUBJECT,
  buildImplementerGmailUrl,
  buildImplementerMailto,
} from "./implementerMailto";

const BODY_WITH_SHOP = "שלום, אשמח לאיפוס סיסמת ניהול למערכת התורים.\nשם החנות: שם העסק";

describe("buildImplementerMailto", () => {
  it("uses the implementer email with encoded Hebrew subject and body", () => {
    const href = buildImplementerMailto("oded@example.com", "שם העסק");
    expect(href.startsWith("mailto:oded@example.com?")).toBe(true);
    expect(href).toContain(`subject=${encodeURIComponent(IMPLEMENTER_RESET_SUBJECT)}`);
    expect(href).toContain("body=");
    expect(href).not.toContain("wa.me");

    const params = new URL(href).searchParams;
    expect(params.get("subject")).toBe("בקשת איפוס סיסמת ניהול");
    expect(params.get("body")).toBe(BODY_WITH_SHOP);
  });

  it("returns no mailto URL when the email is empty", () => {
    expect(buildImplementerMailto("")).toBe("");
    expect(buildImplementerMailto("   ")).toBe("");
    expect(buildImplementerMailto("\n")).toBe("");
  });

  it("leaves the shop-name line blank when Settings has no name", () => {
    const href = buildImplementerMailto("oded@example.com");
    const body = new URL(href).searchParams.get("body") ?? "";
    expect(body).toContain("שם החנות:");
    expect(body).not.toContain("שם החנות: שם");
  });
});

describe("buildImplementerGmailUrl", () => {
  it("builds a Gmail compose URL with to and encoded su/body", () => {
    const href = buildImplementerGmailUrl("oded@example.com", "שם העסק");
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("fs")).toBe("1");
    expect(url.searchParams.get("to")).toBe("oded@example.com");
    expect(url.searchParams.get("su")).toBe(IMPLEMENTER_RESET_SUBJECT);
    expect(url.searchParams.get("body")).toBe(BODY_WITH_SHOP);
    expect(href).toContain(`su=${encodeURIComponent(IMPLEMENTER_RESET_SUBJECT)}`);
    expect(href).toContain(`body=${encodeURIComponent(BODY_WITH_SHOP)}`);
    expect(href).not.toContain("wa.me");
  });

  it("returns no Gmail URL when the email is empty", () => {
    expect(buildImplementerGmailUrl("")).toBe("");
    expect(buildImplementerGmailUrl("   ")).toBe("");
  });
});
