import { Router } from "express";
import {
  getGameweeks,
  getCurrentGameweek,
  getGameweekById,
} from "../controllers/gameweek.controller.js";

const router = Router();

// GET /api/v1/gameweeks
router.get("/", getGameweeks);

// GET /api/v1/gameweeks/current
router.get("/current", getCurrentGameweek);

// GET /api/v1/gameweeks/:id
router.get("/:id", getGameweekById);

export default router;
