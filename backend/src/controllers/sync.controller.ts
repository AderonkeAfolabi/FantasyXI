import { Request, Response, NextFunction } from "express";
import { fplSyncService } from "../services/fpl/fplSyncService.js";

/**
 * Admin FPL synchronization controller.
 *
 * Laravel equivalent: Artisan controller running console commands via web requests:
 *   Artisan::call('fpl:sync-bootstrap')
 */
export async function syncBootstrap(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await fplSyncService.syncBootstrap();
    res.json({
      success: true,
      message: "FPL bootstrap data synchronized successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function syncFixtures(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await fplSyncService.syncFixtures();
    res.json({
      success: true,
      message: "FPL fixtures synchronized successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function syncGameweekLive(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const gameweekId = parseInt(req.params.id as string, 10);
    if (isNaN(gameweekId)) {
      res.status(400).json({
        success: false,
        message: "Invalid gameweek ID",
      });
      return;
    }

    const result = await fplSyncService.syncGameweekLiveStats(gameweekId);
    res.json({
      success: true,
      message: `Gameweek ${gameweekId} live stats synchronized successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
