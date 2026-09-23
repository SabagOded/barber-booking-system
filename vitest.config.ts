import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "file:./test.db",
      USE_TURSO: "false",
      ADMIN_PASSWORD: "vitest-admin-password",
      SESSION_SECRET: "vitest-session-secret-not-for-production-use",
      IMPLEMENTER_WHATSAPP: "972511111111",
      IMPLEMENTER_EMAIL: "oded@example.com",
    },
    fileParallelism: false,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
