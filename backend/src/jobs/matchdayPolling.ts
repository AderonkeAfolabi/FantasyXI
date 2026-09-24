import { prisma } from "../config/db.js";
import type { FplSyncTask } from "../queues/fplSyncQueue.js";

/**
 * Matchday Polling Job.
 *
 * While any fixture is live (started, or past kickoff, and not finished) it
 * computes the set of FPL sync tasks for the affected gameweeks. The tasks are
 * enqueued onto the `fpl-sync` queue rather than executed inline so the sync
 * engine gets retry + dead-letter protection. Scheduled every 60 seconds; does
 * nothing outside of matchdays.
 */
export async function collectMatchdaySyncTasks(
  now: Date = new Date()
): Promise<FplSyncTask[]> {
  const liveFixtures = await prisma.fixture.findMany({
    where: {
      finished: false,
      gameweekId: { not: null },
      OR: [{ started: true }, { kickoffTime: { lte: now } }],
    },
    select: { gameweek: { select: { fplId: true } } },
  });

  const gameweekFplIds = [
    ...new Set(
      liveFixtures
        .map((f) => f.gameweek?.fplId)
        .filter((id): id is number => id !== undefined)
    ),
  ];
  if (gameweekFplIds.length === 0) {
    return [];
  }

  const tasks: FplSyncTask[] = [{ type: "fixtures" }];
  for (const fplId of gameweekFplIds) {
    tasks.push({ type: "gameweek-live", gameweekFplId: fplId });
  }

  return tasks;
}
