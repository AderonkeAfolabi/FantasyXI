import { Router } from "express";
import {
  createLeague,
  getLeagues,
  getLeagueById,
  joinLeague,
  getLeagueMembers,
  getLeagueStandings,
  cancelLeague,
} from "../controllers/league.controller.js";

const router = Router();

// POST /api/v1/leagues
router.post("/", createLeague);

// GET /api/v1/leagues
router.get("/", getLeagues);

// GET /api/v1/leagues/:id
router.get("/:id", getLeagueById);

// POST /api/v1/leagues/:id/join
router.post("/:id/join", joinLeague);

// GET /api/v1/leagues/:id/members
router.get("/:id/members", getLeagueMembers);

// GET /api/v1/leagues/:id/standings
router.get("/:id/standings", getLeagueStandings);

// POST /api/v1/leagues/:id/cancel
router.post("/:id/cancel", cancelLeague);

export default router;
