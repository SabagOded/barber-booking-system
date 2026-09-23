import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { isDemoMode } from "./demoMode";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const LOGIN_FAIL_DELAY_MS = 400;
export const WRONG_PASSWORD_MESSAGE = "סיסמה שגויה";

export type AdminSession = {
  role: "admin";
};

export type SessionCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  expires: Date;
};

export type SessionCookieStore = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: SessionCookieOptions): void;
  delete(name: string): void;
};

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionCookieOptions(expires: Date, maxAge: number): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
    expires,
  };
}

function secretBytes(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

export async function verifyPassword(submitted: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const submittedDigest = sha256(typeof submitted === "string" ? submitted : "");
  const expectedDigest = sha256(expected);
  const match =
    expected.length > 0 &&
    submitted.length > 0 &&
    timingSafeEqual(submittedDigest, expectedDigest);

  if (!match) {
    await sleep(LOGIN_FAIL_DELAY_MS);
  }
  return match;
}

export async function createSession(store: SessionCookieStore): Promise<void> {
  const secret = secretBytes();
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }

  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret);

  store.set(ADMIN_SESSION_COOKIE, token, sessionCookieOptions(expires, SESSION_MAX_AGE_SECONDS));
}

export async function readSessionFromToken(
  token: string | undefined,
): Promise<AdminSession | null> {
  if (!token) {
    return null;
  }
  const secret = secretBytes();
  if (!secret) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (payload.role !== "admin") {
      return null;
    }
    return { role: "admin" };
  } catch {
    return null;
  }
}

export async function readSession(store: SessionCookieStore): Promise<AdminSession | null> {
  return readSessionFromToken(store.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function clearSession(store: SessionCookieStore): Promise<void> {
  store.set(ADMIN_SESSION_COOKIE, "", sessionCookieOptions(new Date(0), 0));
  store.delete(ADMIN_SESSION_COOKIE);
}

export async function loadProtectedAdmin(
  store: SessionCookieStore,
): Promise<{ ok: true; session: AdminSession } | { ok: false }> {
  if (isDemoMode()) {
    return { ok: true, session: { role: "admin" } };
  }

  const session = await readSession(store);
  if (!session) {
    return { ok: false };
  }
  return { ok: true, session };
}

export async function attemptAdminLogin(
  password: string,
  store: SessionCookieStore,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await verifyPassword(password))) {
    return { ok: false, error: WRONG_PASSWORD_MESSAGE };
  }
  await createSession(store);
  return { ok: true };
}
