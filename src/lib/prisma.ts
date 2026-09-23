import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const useTurso = process.env.USE_TURSO === "true";

  if (!useTurso) {
    return new PrismaClient();
  }

  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (!url || !authToken) {
    throw new Error(
      "USE_TURSO is enabled but TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing",
    );
  }
  if (!url.startsWith("libsql://")) {
    throw new Error("TURSO_DATABASE_URL must start with libsql://");
  }

  const adapter = new PrismaLibSQL({
    url,
    authToken,
  });

  return new PrismaClient({ adapter });
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}