import { Request, Response, NextFunction } from "express";
import {
  leagueService,
  LeagueValidationError,
  LeagueNotFoundError,
  LeagueForbiddenError,
} from "../services/league/leagueService.js";
import { LeagueStatus } from "../types/index.js";

/**
 * League Controller.
 *
 * Handles HTTP requests for league creation, joining, standings, and lifecycle operations.
 *
 * Laravel equivalent: Like app/Http/Controllers/LeagueController.php using
 * LeaguePolicy and LeagueService.
 */

export async function createLeague(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: "Authentication required to create a league",
      });
      return;
    }

    // Always derive creator identity from authenticated user
    const userId = req.user.id;
    const { userId: _bodyUserId, creatorId: _bodyCreatorId, ...leagueInput } = req.body;

    const league = await leagueService.createLeague(userId, leagueInput);
    res.status(201).json({
      success: true,
      message: "League created successfully",
      data: league,
    });
  } catch (error) {
    if (error instanceof LeagueValidationError) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function getLeagues(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, creatorId } = req.query;

    const leagues = await leagueService.getLeagues({
      status: status ? (status as LeagueStatus) : undefined,
      creatorId: creatorId ? (creatorId as string) : undefined,
    });

    res.json({
      success: true,
      data: leagues,
    });
  } catch (error) {
    next(error);
  }
}

export async function getLeagueById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const league = await leagueService.getLeagueById(id as string);

    res.json({
      success: true,
      data: league,
    });
  } catch (error) {
    if (error instanceof LeagueNotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function joinLeague(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: "Authentication required to join a league",
      });
      return;
    }

    const { id } = req.params;
    const userId = req.user.id;
    const { squadId } = req.body;

    if (!squadId) {
      res.status(400).json({
        success: false,
        message: "squadId is required to join a league",
      });
      return;
    }

    const member = await leagueService.joinLeague(id as string, userId, squadId);

    res.status(201).json({
      success: true,
      message: "Joined league successfully",
      data: member,
    });
  } catch (error) {
    if (error instanceof LeagueNotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    if (error instanceof LeagueValidationError) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function getLeagueMembers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const league = await leagueService.getLeagueById(id as string);

    res.json({
      success: true,
      data: league.members,
    });
  } catch (error) {
    if (error instanceof LeagueNotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function getLeagueStandings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const standingsData = await leagueService.getLeagueStandings(id as string);

    res.json({
      success: true,
      data: standingsData,
    });
  } catch (error) {
    if (error instanceof LeagueNotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function cancelLeague(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: "Authentication required to cancel a league",
      });
      return;
    }

    const { id } = req.params;
    const userId = req.user.id;

    const cancelled = await leagueService.cancelLeague(id as string, userId);

    res.json({
      success: true,
      message: "League has been cancelled",
      data: cancelled,
    });
  } catch (error) {
    if (error instanceof LeagueNotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    if (error instanceof LeagueForbiddenError) {
      res.status(403).json({
        success: false,
        message: error.message,
      });
      return;
    }
    if (error instanceof LeagueValidationError) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}
