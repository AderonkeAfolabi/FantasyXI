import { Router } from "express";
import { getPlayers, getPlayerById } from "../controllers/player.controller.js";

const router = Router();

// GET /api/v1/players
router.get("/", getPlayers);

// GET /api/v1/players/:id
router.get("/:id", getPlayerById);

export default router;
