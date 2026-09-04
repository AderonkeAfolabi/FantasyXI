import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client singleton.
 *
 * In development, Next.js/tsx hot-reloading would create a new PrismaClient
 * on every reload, eventually exhausting database connections.
 *
 * This pattern stores a single instance on `globalThis` so it survives reloads.
 *
 * Laravel equivalent: This is like the DB facade — one shared connection pool
 * that every part of your app uses. You never call `new PDO()` manually.
 */

// Extend globalThis to hold our Prisma instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
