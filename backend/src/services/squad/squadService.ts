import { prisma } from "../../config/db.js";
import {
  ChipType,
  CreateSquadInput,
  UpdateSquadInput,
} from "../../types/index.js";
import {
  SquadValidator,
  SquadValidationError,
  SquadLockedError,
  PlayerForValidation,
} from "./squadValidator.js";

/**
 * Custom error thrown when a user attempts to modify a squad they do not own.
 *
 * Laravel equivalent: AuthorizationException thrown by Gate::authorize() or Policy.
 */
export class SquadForbiddenError extends Error {
  constructor(message: string = "You are not authorized to modify this squad") {
    super(message);
    this.name = "SquadForbiddenError";
  }
}

/**
 * Thrown when a chip cannot be played (already used this season, or another
 * chip is already active for the gameweek).
 */
export class ChipUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChipUnavailableError";
  }
}

/** Lineup snapshot stored when Free Hit is played, restored after the gameweek. */
interface FreeHitSnapshot {
  budgetRemaining: string;
  players: Array<{
    playerId: number;
    isCaptain: boolean;
    isViceCaptain: boolean;
    isStarter: boolean;
    positionOrder: number;
    purchasePrice: string;
  }>;
}

/**
 * Fantasy Squad Management Service.
 *
 * Handles creation, updates, and retrieval of user squads with strict
 * business validation and deadline enforcement.
 *
 * Laravel equivalent: Like a dedicated SquadRepository / SquadAction service:
 *   (e.g. app/Services/SquadService.php)
 */
export class SquadService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any = prisma) {}
  /**
   * Creates a new 15-player squad for a user.
   */
  public async createSquad(input: CreateSquadInput) {
    if (!input.name || input.name.trim().length === 0) {
      throw new SquadValidationError("Squad name is required");
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) {
      throw new SquadValidationError(`User ${input.userId} not found`);
    }

    // Fetch players for validation
    const playerIds = input.players.map((p) => p.playerId);
    const dbPlayers = await prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: {
        id: true,
        teamId: true,
        position: true,
        price: true,
        displayName: true,
      },
    });

    const playersForValidation: PlayerForValidation[] = dbPlayers.map((p) => ({
      id: p.id,
      teamId: p.teamId,
      position: p.position,
      price: Number(p.price),
      displayName: p.displayName,
    }));

    // Run pure validation
    const validated = SquadValidator.validateSquad(
      input.players,
      playersForValidation
    );

    const budgetRemaining = Math.round((100.0 - validated.totalCost) * 10) / 10;

    // Persist in transaction
    const squad = await prisma.$transaction(async (tx) => {
      const created = await tx.squad.create({
        data: {
          userId: input.userId,
          name: input.name.trim(),
          budgetRemaining,
        },
      });

      const playerMap = new Map(dbPlayers.map((p) => [p.id, p]));

      await tx.squadPlayer.createMany({
        data: input.players.map((sel) => {
          const p = playerMap.get(sel.playerId)!;
          return {
            squadId: created.id,
            playerId: sel.playerId,
            isStarter: sel.isStarter,
            isCaptain: sel.isCaptain,
            isViceCaptain: sel.isViceCaptain,
            positionOrder: sel.positionOrder,
            purchasePrice: p.price,
          };
        }),
      });

      return tx.squad.findUnique({
        where: { id: created.id },
        include: {
          players: {
            include: {
              player: {
                include: { team: true },
              },
            },
            orderBy: { positionOrder: "asc" },
          },
        },
      });
    });

    return squad;
  }

  /**
   * Updates a squad's lineup, captaincy, or transfers.
   * Throws SquadLockedError if the active gameweek deadline has passed.
   */
  public async updateSquad(
    squadId: string,
    input: UpdateSquadInput,
    requestingUserId?: string
  ) {
    const existing = await this.db.squad.findUnique({
      where: { id: squadId },
    });

    if (!existing) {
      throw new SquadValidationError(`Squad ${squadId} not found`);
    }

    if (requestingUserId && existing.userId !== requestingUserId) {
      throw new SquadForbiddenError(
        "You are not authorized to modify this squad"
      );
    }

    // Check gameweek deadline
    const currentGameweek = await prisma.gameweek.findFirst({
      where: { isCurrent: true },
    });

    if (currentGameweek) {
      SquadValidator.validateDeadline(currentGameweek.deadline);
    }

    // Squads stay locked from the deadline lock until the gameweek is settled
    const lockedGameweek = await prisma.gameweek.findFirst({
      where: { isLocked: true, settledAt: null },
    });
    if (lockedGameweek) {
      throw new SquadLockedError(lockedGameweek.deadline);
    }

    // Fetch players for validation
    const playerIds = input.players.map((p) => p.playerId);
    const dbPlayers = await prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: {
        id: true,
        teamId: true,
        position: true,
        price: true,
        displayName: true,
      },
    });

    const playersForValidation: PlayerForValidation[] = dbPlayers.map((p) => ({
      id: p.id,
      teamId: p.teamId,
      position: p.position,
      price: Number(p.price),
      displayName: p.displayName,
    }));

    const validated = SquadValidator.validateSquad(
      input.players,
      playersForValidation
    );

    const budgetRemaining = Math.round((100.0 - validated.totalCost) * 10) / 10;
    const playerMap = new Map(dbPlayers.map((p) => [p.id, p]));

    return prisma.$transaction(async (tx) => {
      // 1. Update squad metadata
      await tx.squad.update({
        where: { id: squadId },
        data: {
          name: input.name ? input.name.trim() : existing.name,
          budgetRemaining,
        },
      });

      // 2. Remove existing squad players
      await tx.squadPlayer.deleteMany({
        where: { squadId },
      });

      // 3. Insert new squad players
      await tx.squadPlayer.createMany({
        data: input.players.map((sel) => {
          const p = playerMap.get(sel.playerId)!;
          return {
            squadId,
            playerId: sel.playerId,
            isStarter: sel.isStarter,
            isCaptain: sel.isCaptain,
            isViceCaptain: sel.isViceCaptain,
            positionOrder: sel.positionOrder,
            purchasePrice: p.price,
          };
        }),
      });

      // Return updated squad with players
      return tx.squad.findUnique({
        where: { id: squadId },
        include: {
          players: {
            include: {
              player: {
                include: { team: true },
              },
            },
            orderBy: { positionOrder: "asc" },
          },
        },
      });
    });
  }

  /**
   * Plays a chip for a gameweek before its deadline.
   * Each chip can be used once per season and only one chip per gameweek.
   * Free Hit snapshots the current lineup so it can be restored after the gameweek.
   */
  public async activateChip(
    squadId: string,
    chipType: ChipType,
    gameweekId: number,
    requestingUserId: string
  ) {
    if (!Object.values(ChipType).includes(chipType)) {
      throw new SquadValidationError(`Invalid chip type: ${chipType}`);
    }

    const squad = await this.db.squad.findUnique({
      where: { id: squadId },
      include: { players: true },
    });
    if (!squad) {
      throw new SquadValidationError(`Squad ${squadId} not found`);
    }
    if (squad.userId !== requestingUserId) {
      throw new SquadForbiddenError(
        "You are not authorized to play chips for this squad"
      );
    }

    const gameweek = await this.db.gameweek.findUnique({
      where: { id: gameweekId },
    });
    if (!gameweek) {
      throw new SquadValidationError(`Gameweek ${gameweekId} not found`);
    }
    if (gameweek.isLocked) {
      throw new SquadLockedError(gameweek.deadline);
    }
    SquadValidator.validateDeadline(gameweek.deadline);

    const [usedThisGameweek, usedThisSeason] = await Promise.all([
      this.db.squadChipUsage.findUnique({
        where: { squadId_gameweekId: { squadId, gameweekId } },
      }),
      this.db.squadChipUsage.findUnique({
        where: {
          squadId_season_chipType: {
            squadId,
            season: gameweek.season,
            chipType,
          },
        },
      }),
    ]);

    if (usedThisGameweek) {
      throw new ChipUnavailableError(
        `A chip (${usedThisGameweek.chipType}) is already active for ${gameweek.name}`
      );
    }
    if (usedThisSeason) {
      throw new ChipUnavailableError(
        `${chipType} has already been used this season`
      );
    }

    let previousLineup: FreeHitSnapshot | undefined;
    if (chipType === ChipType.FREE_HIT) {
      previousLineup = {
        budgetRemaining: squad.budgetRemaining.toString(),
        players: squad.players.map((sp: any) => ({
          playerId: sp.playerId,
          isCaptain: sp.isCaptain,
          isViceCaptain: sp.isViceCaptain,
          isStarter: sp.isStarter,
          positionOrder: sp.positionOrder,
          purchasePrice: sp.purchasePrice.toString(),
        })),
      };
    }

    try {
      return await this.db.squadChipUsage.create({
        data: {
          squadId,
          gameweekId,
          chipType,
          season: gameweek.season,
          previousLineup,
        },
      });
    } catch (error: any) {
      // Unique constraints enforce the chip rules under concurrent requests
      if (error?.code === "P2002") {
        throw new ChipUnavailableError(
          `${chipType} cannot be played: a chip is already active for this gameweek or was used this season`
        );
      }
      throw error;
    }
  }

  /**
   * Restores the lineup saved when Free Hit was played for a completed gameweek.
   * Returns false when there is nothing to revert (no Free Hit, or already reverted).
   */
  public async revertFreeHit(squadId: string, gameweekId: number): Promise<boolean> {
    const usage = await this.db.squadChipUsage.findUnique({
      where: { squadId_gameweekId: { squadId, gameweekId } },
    });
    if (
      !usage ||
      usage.chipType !== ChipType.FREE_HIT ||
      usage.revertedAt ||
      !usage.previousLineup
    ) {
      return false;
    }

    const snapshot = usage.previousLineup as FreeHitSnapshot;

    await this.db.$transaction(async (tx: any) => {
      await tx.squadPlayer.deleteMany({ where: { squadId } });
      await tx.squadPlayer.createMany({
        data: snapshot.players.map((p) => ({ squadId, ...p })),
      });
      await tx.squad.update({
        where: { id: squadId },
        data: { budgetRemaining: snapshot.budgetRemaining },
      });
      await tx.squadChipUsage.update({
        where: { id: usage.id },
        data: { revertedAt: new Date() },
      });
    });

    return true;
  }

  /**
   * Retrieves a squad by ID with full player details.
   */
  public async getSquad(squadId: string) {
    const squad = await prisma.squad.findUnique({
      where: { id: squadId },
      include: {
        players: {
          include: {
            player: {
              include: { team: true },
            },
          },
          orderBy: { positionOrder: "asc" },
        },
        gameweekScores: {
          include: { gameweek: true },
          orderBy: { gameweekId: "desc" },
        },
      },
    });

    if (!squad) {
      throw new SquadValidationError(`Squad with ID ${squadId} not found`);
    }

    return squad;
  }

  /**
   * Retrieves all squads belonging to a user.
   */
  public async getUserSquads(userId: string) {
    return prisma.squad.findMany({
      where: { userId },
      include: {
        players: {
          include: {
            player: {
              include: { team: true },
            },
          },
          orderBy: { positionOrder: "asc" },
        },
      },
    });
  }
}

export const squadService = new SquadService();
