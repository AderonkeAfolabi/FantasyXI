import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/db.js";

/**
 * Team Controller.
 *
 * Provides endpoints for retrieving Premier League teams and their squads.
 */

export async function getTeams(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { players: true },
        },
      },
    });

    res.json({
      success: true,
      data: teams,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTeamById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid team ID",
      });
      return;
    }

    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        players: {
          orderBy: { totalPoints: "desc" },
        },
        homeFixtures: {
          take: 5,
          orderBy: { kickoffTime: "asc" },
          include: { awayTeam: true },
        },
        awayFixtures: {
          take: 5,
          orderBy: { kickoffTime: "asc" },
          include: { homeTeam: true },
        },
      },
    });

    if (!team) {
      res.status(404).json({
        success: false,
        message: `Team with ID ${id} not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: team,
    });
  } catch (error) {
    next(error);
  }
}
