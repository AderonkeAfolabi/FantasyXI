import PgBoss from "pg-boss";
import { pollMatchday } from "../jobs/matchdayPolling.js";
import { lockDueGameweeks } from "../jobs/deadlineLocking.js";
import { settleCompletedGameweeks } from "../jobs/gameweekSettlement.js";
import { processLeagueRefunds } from "../jobs/leagueRefunds.js";

/**
 * PostgreSQL-backed background job queue (pg-boss).
 *
 * Every recurring job is a cron-scheduled queue with retries and exponential backoff.
 * The "stately" policy keeps at most one queued and one active job per queue, so a
 * slow run never piles up duplicates.
 *
 * Laravel equivalent: the scheduler (app/Console/Kernel.php) + database queue workers.
 */

interface JobDefinition {
  name: string;
  cron: string;
  handler: () => Promise<unknown>;
}

export interface QueueMetrics {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
}

export const JOB_DEFINITIONS: JobDefinition[] = [
  { name: "matchday-poll", cron: "* * * * *", handler: () => pollMatchday() },
  { name: "deadline-lock", cron: "* * * * *", handler: () => lockDueGameweeks() },
  { name: "gameweek-settlement", cron: "*/5 * * * *", handler: () => settleCompletedGameweeks() },
  { name: "league-refunds", cron: "*/5 * * * *", handler: () => processLeagueRefunds() },
];

const QUEUE_OPTIONS = {
  policy: "stately" as const,
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
};

let boss: PgBoss | null = null;
const metrics = new Map<string, QueueMetrics>(
  JOB_DEFINITIONS.map((def) => [
    def.name,
    {
      processed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      lastRunAt: null,
      lastDurationMs: null,
      lastError: null,
    },
  ])
);

/**
 * Runs a job handler while recording metrics and logs. Rethrows so pg-boss retries.
 */
export async function runWithMetrics(
  def: JobDefinition,
  retryCount: number
): Promise<void> {
  const m = metrics.get(def.name)!;
  const startedAt = Date.now();
  if (retryCount > 0) m.retried++;

  try {
    const result = await def.handler();
    m.succeeded++;
    console.log(`[jobs] ${def.name} completed in ${Date.now() - startedAt}ms`, result ?? "");
  } catch (error) {
    m.failed++;
    m.lastError = (error as Error).message;
    console.error(`[jobs] ${def.name} failed (attempt ${retryCount + 1}):`, error);
    throw error;
  } finally {
    m.processed++;
    m.lastRunAt = new Date(startedAt).toISOString();
    m.lastDurationMs = Date.now() - startedAt;
  }
}

export async function startJobQueue(connectionString: string): Promise<void> {
  if (boss) return;

  const instance = new PgBoss(connectionString);
  instance.on("error", (error) => console.error("[jobs] pg-boss error:", error));
  await instance.start();

  for (const def of JOB_DEFINITIONS) {
    await instance.createQueue(def.name, { name: def.name, ...QUEUE_OPTIONS });
    await instance.schedule(def.name, def.cron);
    await instance.work(def.name, { includeMetadata: true }, async ([job]) =>
      runWithMetrics(def, job.retryCount)
    );
  }

  boss = instance;
  console.log(`[jobs] Job queue started: ${JOB_DEFINITIONS.map((d) => d.name).join(", ")}`);
}

export async function stopJobQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true });
  boss = null;
}

/**
 * Snapshot for /api/health/queues: per-queue backlog plus in-process metrics.
 */
export async function getQueueHealth() {
  const queues = await Promise.all(
    JOB_DEFINITIONS.map(async (def) => ({
      name: def.name,
      schedule: def.cron,
      queued: boss ? await boss.getQueueSize(def.name) : null,
      ...metrics.get(def.name)!,
    }))
  );
  return { running: boss !== null, queues };
}
