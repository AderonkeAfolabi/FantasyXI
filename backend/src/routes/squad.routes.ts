import { Router } from "express";
import {
  createSquad,
  getSquadById,
  updateSquad,
  getUserSquads,
  calculateGameweekScore,
} from "../controllers/squad.controller.js";

const router = Router();

// POST /api/v1/squads
router.post("/", createSquad);

// GET /api/v1/squads/:id
router.get("/:id", getSquadById);

// PUT /api/v1/squads/:id
router.put("/:id", updateSquad);

// GET /api/v1/squads/user/:userId
router.get("/user/:userId", getUserSquads);

// POST /api/v1/squads/:id/calculate-score/:gameweekId
router.post("/:id/calculate-score/:gameweekId", calculateGameweekScore);

export default router;
