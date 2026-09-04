import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/db.js";

/**
 * Fixture Controller.
 *
 * Provides endpoints for retrieving Premier League match fixtures.
 */

export async function getFixtures(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { gameweekId, teamId, upcoming } = req.query;

    const where: any = {};

    if (gameweekId) {
      const parsedGw = parseInt(gameweekId as string, 10);
      if (!isNaN(parsedGw)) {
        where.gameweekId = parsedGw;
      }
    }

    if (teamId) {
      const parsedTeam = parseInt(teamId as string, 10);
      if (!isNaN(parsedTeam)) {
        where.OR = [{ homeTeamId: parsedTeam }, { awayTeamId: parsedTeam }];
      }
    }

    if (upcoming === "true") {
      where.finished = false;
    }

    const fixtures = await prisma.fixture.findMany({
      where,
      include: {
        homeTeam: {
          select: {
            id: true,
            fplId: true,
            name: true,
            shortName: true,
            logoUrl: true,
          },
        },
        awayTeam: {
          select: {
            id: true,
            fplId: true,
            name: true,
            shortName: true,
            logoUrl: true,
          },
        },
        gameweek: {
          select: {
            id: true,
            fplId: true,
            name: true,
            deadline: true,
          },
        },
      },
      orderBy: { kickoffTime: "asc" },
    });

    res.json({
      success: true,
      data: fixtures,
    });
  } catch (error) {
    next(error);
  }
}
