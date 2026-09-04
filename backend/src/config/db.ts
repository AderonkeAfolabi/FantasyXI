import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client singleton with lazy initialization.
 *
 * In development, Next.js/tsx hot-reloading would create a new PrismaClient
 * on every reload, eventually exhausting database connections.
 *
 * This pattern stores a single instance on `globalThis` so it survives reloads,
 * and defers instantiation until the first actual database call.
 *
 * Laravel equivalent: This is like the DB facade — one shared connection pool
 * that every part of your app uses. You never call `new PDO()` manually.
 */

// Extend globalThis to hold our Prisma instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaInstance(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaInstance();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
