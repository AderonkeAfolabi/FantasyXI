import { Router } from "express";
import {
  syncBootstrap,
  syncFixtures,
  syncGameweekLive,
} from "../controllers/sync.controller.js";

const router = Router();

// POST /api/v1/admin/sync/bootstrap
router.post("/bootstrap", syncBootstrap);

// POST /api/v1/admin/sync/fixtures
router.post("/fixtures", syncFixtures);

// POST /api/v1/admin/sync/gameweek/:id
router.post("/gameweek/:id", syncGameweekLive);

export default router;
