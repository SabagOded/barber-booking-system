import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSession, type SessionCookieStore } from "@/lib/adminSession";
import { proxy } from "./proxy";

const ORIGINAL_DEMO_MODE = process.env.DEMO_MODE;

function request(pathname: string, sessionToken?: string) {
  const headers = sessionToken
    ? { cookie: `admin_session=${sessionToken}` }
    : undefined;
  return new NextRequest(`https://example.com${pathname}`, { headers });
}

async function validSessionToken() {
  let token = "";
  const store: SessionCookieStore = {
    get() {
      return token ? { value: token } : undefined;
    },
    set(_name, value) {
      token = value;
    },
    delete() {
      token = "";
    },
  };
  await createSession(store);
  return token;
}

describe("admin proxy routing", () => {
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

  it("allows admin routes without a session and redirects login in demo mode", async () => {
    process.env.DEMO_MODE = "true";

    const adminResponse = await proxy(request("/admin"));
    const nestedResponse = await proxy(request("/admin/services"));
    const loginResponse = await proxy(request("/admin/login"));

    expect(adminResponse.headers.get("x-middleware-next")).toBe("1");
    expect(nestedResponse.headers.get("x-middleware-next")).toBe("1");
    expect(loginResponse.headers.get("location")).toBe("https://example.com/admin");
  });

  it("still redirects a missing session to login in normal mode", async () => {
    const response = await proxy(request("/admin"));

    expect(response.headers.get("location")).toBe("https://example.com/admin/login");
  });

  it("preserves authenticated routing in normal mode", async () => {
    const token = await validSessionToken();

    const adminResponse = await proxy(request("/admin", token));
    const loginResponse = await proxy(request("/admin/login", token));

    expect(adminResponse.headers.get("x-middleware-next")).toBe("1");
    expect(loginResponse.headers.get("location")).toBe("https://example.com/admin");
  });
});
