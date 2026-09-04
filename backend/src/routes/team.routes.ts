import { Router } from "express";
import { getTeams, getTeamById } from "../controllers/team.controller.js";

const router = Router();

// GET /api/v1/teams
router.get("/", getTeams);

// GET /api/v1/teams/:id
router.get("/:id", getTeamById);

export default router;
