import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  LOGIN_FAIL_DELAY_MS,
  WRONG_PASSWORD_MESSAGE,
  attemptAdminLogin,
  clearSession,
  createSession,
  loadProtectedAdmin,
  readSession,
  type SessionCookieStore,
  verifyPassword,
} from "./adminSession";

const TEST_PASSWORD = "vitest-admin-password";
const ORIGINAL_DEMO_MODE = process.env.DEMO_MODE;

function memoryCookies(initial?: Record<string, string>): SessionCookieStore {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    get(name) {
      const value = map.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name, value) {
      map.set(name, value);
    },
    delete(name) {
      map.delete(name);
    },
  };
}

describe("admin session", () => {
  beforeEach(() => {
    process.env.DEMO_MODE = "false";
  });

  afterEach(() => {
    if (ORIGINAL_DEMO_MODE === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = ORIGINAL_DEMO_MODE;
    }
  });

  it("rejects a wrong password with the same Hebrew error as an empty one", async () => {
    const store = memoryCookies();
    const wrong = await attemptAdminLogin("not-the-password", store);
    const empty = await attemptAdminLogin("", store);

    expect(wrong).toEqual({ ok: false, error: WRONG_PASSWORD_MESSAGE });
    expect(empty).toEqual({ ok: false, error: WRONG_PASSWORD_MESSAGE });
    expect(await readSession(store)).toBeNull();
  });

  it("accepts the harness password and sets a readable session cookie", async () => {
    expect(process.env.ADMIN_PASSWORD).toBe(TEST_PASSWORD);
    expect(await verifyPassword(TEST_PASSWORD)).toBe(true);

    const store = memoryCookies();
    const result = await attemptAdminLogin(TEST_PASSWORD, store);
    expect(result).toEqual({ ok: true });

    const session = await readSession(store);
    expect(session).toEqual({ role: "admin" });
    expect(store.get(ADMIN_SESSION_COOKIE)?.value).toBeTruthy();
  });

  it("rejects a missing session in normal mode", async () => {
    const result = await loadProtectedAdmin(memoryCookies());
    expect(result.ok).toBe(false);
    expect(await readSession(memoryCookies())).toBeNull();
  });

  it("keeps normal authenticated session behavior working", async () => {
    const store = memoryCookies();
    await createSession(store);
    const result = await loadProtectedAdmin(store);
    expect(result).toEqual({ ok: true, session: { role: "admin" } });
  });

  it("loads the protected admin helper without a session in demo mode only", async () => {
    process.env.DEMO_MODE = "true";
    const store = memoryCookies();

    expect(await loadProtectedAdmin(store)).toEqual({
      ok: true,
      session: { role: "admin" },
    });
    expect(await readSession(store)).toBeNull();
  });

  it("rejects a tampered session cookie", async () => {
    const store = memoryCookies();
    await createSession(store);
    const token = store.get(ADMIN_SESSION_COOKIE)?.value ?? "";
    store.set(ADMIN_SESSION_COOKIE, `${token}x`, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 1,
      expires: new Date(),
    });
    expect(await readSession(store)).toBeNull();
    expect((await loadProtectedAdmin(store)).ok).toBe(false);
  });

  it("logout invalidates the session", async () => {
    const store = memoryCookies();
    await createSession(store);
    expect((await loadProtectedAdmin(store)).ok).toBe(true);

    await clearSession(store);
    expect(await readSession(store)).toBeNull();
    expect((await loadProtectedAdmin(store)).ok).toBe(false);
  });

  it("waits about 400ms after a failed password check", async () => {
    const started = Date.now();
    await verifyPassword("nope");
    expect(Date.now() - started).toBeGreaterThanOrEqual(LOGIN_FAIL_DELAY_MS - 50);
  });
});
