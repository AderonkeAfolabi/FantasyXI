import { Router } from "express";
import { getFixtures } from "../controllers/fixture.controller.js";

const router = Router();

// GET /api/v1/fixtures
router.get("/", getFixtures);

export default router;
