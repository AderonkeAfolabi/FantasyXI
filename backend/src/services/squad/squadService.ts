import { prisma } from "../../config/db.js";
import { CreateSquadInput, UpdateSquadInput } from "../../types/index.js";
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
