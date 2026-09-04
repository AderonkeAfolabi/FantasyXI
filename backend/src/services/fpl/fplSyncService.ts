import { prisma } from "../../config/db.js";
import { fplClient } from "./fplClient.js";
import {
  normalizeTeam,
  normalizePlayer,
  normalizeGameweek,
  normalizeFixture,
  normalizePlayerStats,
} from "./fplNormalizer.js";

/**
 * FPL Data Synchronization Service.
 *
 * Pulls external FPL data, normalizes it, and syncs into PostgreSQL via Prisma.
 *
 * Laravel equivalent: Like a scheduled Artisan command class:
 *   php artisan fpl:sync-bootstrap
 *   php artisan fpl:sync-fixtures
 *   php artisan fpl:sync-gameweek {id}
 */

export interface SyncBootstrapResult {
  teamsCount: number;
  gameweeksCount: number;
  playersCount: number;
}

export interface SyncFixturesResult {
  fixturesCount: number;
}

export interface SyncStatsResult {
  gameweekId: number;
  gameweekFplId: number;
  statsCount: number;
}

export class FplSyncService {
  /**
   * Synchronizes Teams, Gameweeks, and Players from FPL bootstrap-static.
   */
  public async syncBootstrap(): Promise<SyncBootstrapResult> {
    console.log("🔄 Starting FPL bootstrap sync...");
    const raw = await fplClient.getBootstrapStatic();

    // 1. Sync Teams
    console.log(`Synchronizing ${raw.teams.length} teams...`);
    const teamPromises = raw.teams.map((rawTeam) => {
      const team = normalizeTeam(rawTeam);
      return prisma.team.upsert({
        where: { fplId: team.fplId },
        update: {
          name: team.name,
          shortName: team.shortName,
          logoUrl: team.logoUrl,
          strength: team.strength,
          strengthOverallHome: team.strengthOverallHome,
          strengthOverallAway: team.strengthOverallAway,
          strengthAttackHome: team.strengthAttackHome,
          strengthAttackAway: team.strengthAttackAway,
          strengthDefenceHome: team.strengthDefenceHome,
          strengthDefenceAway: team.strengthDefenceAway,
        },
        create: {
          fplId: team.fplId,
          name: team.name,
          shortName: team.shortName,
          logoUrl: team.logoUrl,
          strength: team.strength,
          strengthOverallHome: team.strengthOverallHome,
          strengthOverallAway: team.strengthOverallAway,
          strengthAttackHome: team.strengthAttackHome,
          strengthAttackAway: team.strengthAttackAway,
          strengthDefenceHome: team.strengthDefenceHome,
          strengthDefenceAway: team.strengthDefenceAway,
        },
      });
    });
    const syncedTeams = await Promise.all(teamPromises);

    // Build map of team FPL ID -> Local Database ID
    const teamMap = new Map<number, number>();
    for (const team of syncedTeams) {
      teamMap.set(team.fplId, team.id);
    }

    // 2. Sync Gameweeks
    console.log(`Synchronizing ${raw.events.length} gameweeks...`);
    const gwPromises = raw.events.map((rawEvent) => {
      const gw = normalizeGameweek(rawEvent);
      return prisma.gameweek.upsert({
        where: { fplId: gw.fplId },
        update: {
          name: gw.name,
          deadline: gw.deadline,
          isCurrent: gw.isCurrent,
          isFinished: gw.isFinished,
          season: gw.season,
        },
        create: {
          fplId: gw.fplId,
          name: gw.name,
          deadline: gw.deadline,
          isCurrent: gw.isCurrent,
          isFinished: gw.isFinished,
          season: gw.season,
        },
      });
    });
    const syncedGameweeks = await Promise.all(gwPromises);

    // 3. Sync Players
    console.log(`Synchronizing ${raw.elements.length} players...`);
    let playersCount = 0;
    for (const rawPlayer of raw.elements) {
      const localTeamId = teamMap.get(rawPlayer.team);
      if (!localTeamId) {
        console.warn(`Skipping player ${rawPlayer.id}: Unknown team ${rawPlayer.team}`);
        continue;
      }

      const p = normalizePlayer(rawPlayer);

      await prisma.player.upsert({
        where: { fplId: p.fplId },
        update: {
          firstName: p.firstName,
          lastName: p.lastName,
          displayName: p.displayName,
          position: p.position,
          teamId: localTeamId,
          price: p.price,
          totalPoints: p.totalPoints,
          minutesPlayed: p.minutesPlayed,
          goalsScored: p.goalsScored,
          assists: p.assists,
          cleanSheets: p.cleanSheets,
          form: p.form,
          status: p.status,
          news: p.news,
          chanceOfPlayingNextRound: p.chanceOfPlayingNextRound,
          selectedByPercent: p.selectedByPercent,
          photoUrl: p.photoUrl,
          isAvailable: p.isAvailable,
        },
        create: {
          fplId: p.fplId,
          firstName: p.firstName,
          lastName: p.lastName,
          displayName: p.displayName,
          position: p.position,
          teamId: localTeamId,
          price: p.price,
          totalPoints: p.totalPoints,
          minutesPlayed: p.minutesPlayed,
          goalsScored: p.goalsScored,
          assists: p.assists,
          cleanSheets: p.cleanSheets,
          form: p.form,
          status: p.status,
          news: p.news,
          chanceOfPlayingNextRound: p.chanceOfPlayingNextRound,
          selectedByPercent: p.selectedByPercent,
          photoUrl: p.photoUrl,
          isAvailable: p.isAvailable,
        },
      });
      playersCount++;
    }

    console.log(
      `✅ FPL Bootstrap sync complete: ${syncedTeams.length} teams, ${syncedGameweeks.length} gameweeks, ${playersCount} players.`
    );

    return {
      teamsCount: syncedTeams.length,
      gameweeksCount: syncedGameweeks.length,
      playersCount,
    };
  }

  /**
   * Synchronizes fixtures from FPL.
   */
  public async syncFixtures(): Promise<SyncFixturesResult> {
    console.log("🔄 Starting FPL fixtures sync...");
    const rawFixtures = await fplClient.getFixtures();

    // Preload team and gameweek lookups
    const teams = await prisma.team.findMany({ select: { id: true, fplId: true } });
    const teamMap = new Map<number, number>(teams.map((t) => [t.fplId, t.id]));

    const gameweeks = await prisma.gameweek.findMany({
      select: { id: true, fplId: true },
    });
    const gwMap = new Map<number, number>(gameweeks.map((g) => [g.fplId, g.id]));

    let fixturesCount = 0;
    for (const raw of rawFixtures) {
      const homeTeamId = teamMap.get(raw.team_h);
      const awayTeamId = teamMap.get(raw.team_a);

      if (!homeTeamId || !awayTeamId) {
        continue;
      }

      const gameweekId = raw.event ? gwMap.get(raw.event) ?? null : null;
      const f = normalizeFixture(raw);

      await prisma.fixture.upsert({
        where: { fplId: f.fplId },
        update: {
          gameweekId,
          homeTeamId,
          awayTeamId,
          kickoffTime: f.kickoffTime,
          started: f.started,
          finished: f.finished,
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          minutes: f.minutes,
        },
        create: {
          fplId: f.fplId,
          gameweekId,
          homeTeamId,
          awayTeamId,
          kickoffTime: f.kickoffTime,
          started: f.started,
          finished: f.finished,
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          minutes: f.minutes,
        },
      });
      fixturesCount++;
    }

    console.log(`✅ FPL Fixtures sync complete: ${fixturesCount} fixtures.`);
    return { fixturesCount };
  }

  /**
   * Synchronizes PlayerGameweekStats for a specified gameweek from live event data.
   */
  public async syncGameweekLiveStats(gameweekFplId: number): Promise<SyncStatsResult> {
    console.log(`🔄 Starting FPL live stats sync for Gameweek ${gameweekFplId}...`);
    const gameweek = await prisma.gameweek.findUnique({
      where: { fplId: gameweekFplId },
    });

    if (!gameweek) {
      throw new Error(`Gameweek with fplId ${gameweekFplId} not found in database.`);
    }

    const liveData = await fplClient.getGameweekLive(gameweekFplId);

    // Preload player map
    const players = await prisma.player.findMany({
      select: { id: true, fplId: true },
    });
    const playerMap = new Map<number, number>(players.map((p) => [p.fplId, p.id]));

    let statsCount = 0;
    for (const rawElement of liveData.elements) {
      const localPlayerId = playerMap.get(rawElement.id);
      if (!localPlayerId) {
        continue;
      }

      const stats = normalizePlayerStats(rawElement);

      await prisma.playerGameweekStats.upsert({
        where: {
          playerId_gameweekId: {
            playerId: localPlayerId,
            gameweekId: gameweek.id,
          },
        },
        update: {
          minutes: stats.minutes,
          goals: stats.goals,
          assists: stats.assists,
          cleanSheet: stats.cleanSheet,
          yellowCards: stats.yellowCards,
          redCards: stats.redCards,
          saves: stats.saves,
          bonus: stats.bonus,
          totalPoints: stats.totalPoints,
        },
        create: {
          playerId: localPlayerId,
          gameweekId: gameweek.id,
          minutes: stats.minutes,
          goals: stats.goals,
          assists: stats.assists,
          cleanSheet: stats.cleanSheet,
          yellowCards: stats.yellowCards,
          redCards: stats.redCards,
          saves: stats.saves,
          bonus: stats.bonus,
          totalPoints: stats.totalPoints,
        },
      });
      statsCount++;
    }

    console.log(
      `✅ FPL Gameweek ${gameweekFplId} live stats sync complete: ${statsCount} player stats recorded.`
    );

    return {
      gameweekId: gameweek.id,
      gameweekFplId,
      statsCount,
    };
  }
}

export const fplSyncService = new FplSyncService();
