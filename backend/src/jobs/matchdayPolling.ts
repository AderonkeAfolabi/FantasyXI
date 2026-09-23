import { prisma } from "../config/db.js";
import { fplClient } from "../services/fpl/fplClient.js";
import { fplSyncService } from "../services/fpl/fplSyncService.js";

/**
 * Matchday Polling Job.
 *
 * While any fixture is live (started, or past kickoff, and not finished) it
 * refreshes fixtures and syncs live PlayerGameweekStats for the affected gameweeks.
 * Scheduled every 60 seconds; does nothing outside of matchdays.
 */
export async function pollMatchday(now: Date = new Date()): Promise<number[]> {
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

  // Bypass the FPL client cache so every poll sees fresh live data
  fplClient.clearCache();
  await fplSyncService.syncFixtures();
  for (const fplId of gameweekFplIds) {
    await fplSyncService.syncGameweekLiveStats(fplId);
  }

  return gameweekFplIds;
}
