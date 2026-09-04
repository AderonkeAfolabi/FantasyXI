import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/db.js";
import { Position } from "../types/index.js";

/**
 * Player Controller.
 *
 * Provides endpoints for searching, filtering, and retrieving footballer data.
 *
 * Laravel equivalent: Like app/Http/Controllers/PlayerController.php using
 * Player::with('team')->when(...)->paginate().
 */

export async function getPlayers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      search,
      position,
      teamId,
      minPrice,
      maxPrice,
      isAvailable,
      sortBy = "totalPoints",
      sortOrder = "desc",
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Build Prisma where filter
    const where: any = {};

    if (search && typeof search === "string" && search.trim().length > 0) {
      where.OR = [
        { displayName: { contains: search.trim(), mode: "insensitive" } },
        { firstName: { contains: search.trim(), mode: "insensitive" } },
        { lastName: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    if (position && typeof position === "string" && position in Position) {
      where.position = position as Position;
    }

    if (teamId) {
      const parsedTeamId = parseInt(teamId as string, 10);
      if (!isNaN(parsedTeamId)) {
        where.teamId = parsedTeamId;
      }
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) {
        where.price.gte = parseFloat(minPrice as string);
      }
      if (maxPrice) {
        where.price.lte = parseFloat(maxPrice as string);
      }
    }

    if (isAvailable !== undefined) {
      where.isAvailable = isAvailable === "true";
    }

    // Build orderBy
    const allowedSortFields = [
      "price",
      "totalPoints",
      "minutesPlayed",
      "goalsScored",
      "assists",
      "cleanSheets",
      "form",
    ];
    const sortField = allowedSortFields.includes(sortBy as string)
      ? (sortBy as string)
      : "totalPoints";
    const orderDirection = sortOrder === "asc" ? "asc" : "desc";

    const [players, total] = await Promise.all([
      prisma.player.findMany({
        where,
        include: {
          team: {
            select: {
              id: true,
              fplId: true,
              name: true,
              shortName: true,
              logoUrl: true,
            },
          },
        },
        orderBy: { [sortField]: orderDirection },
        skip,
        take: limitNum,
      }),
      prisma.player.count({ where }),
    ]);

    res.json({
      success: true,
      data: players,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getPlayerById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid player ID",
      });
      return;
    }

    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        team: true,
        gameweekStats: {
          include: { gameweek: true },
          orderBy: { gameweekId: "desc" },
          take: 10,
        },
      },
    });

    if (!player) {
      res.status(404).json({
        success: false,
        message: `Player with ID ${id} not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: player,
    });
  } catch (error) {
    next(error);
  }
}
