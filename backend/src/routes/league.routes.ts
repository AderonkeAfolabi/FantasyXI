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
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

// POST /api/v1/leagues (Protected: creator identity derived from token)
router.post("/", requireAuth, createLeague);

// GET /api/v1/leagues (Public: explore leagues)
router.get("/", getLeagues);

// GET /api/v1/leagues/:id (Public: view league details)
router.get("/:id", getLeagueById);

// POST /api/v1/leagues/:id/join (Protected: member identity derived from token)
router.post("/:id/join", requireAuth, joinLeague);

// GET /api/v1/leagues/:id/members (Public: view league member list)
router.get("/:id/members", getLeagueMembers);

// GET /api/v1/leagues/:id/standings (Public: view league standings)
router.get("/:id/standings", getLeagueStandings);

// POST /api/v1/leagues/:id/cancel (Protected: creator only)
router.post("/:id/cancel", requireAuth, cancelLeague);

export default router;
