import { Router } from "express";
import {
  getPaymentRequirement,
  submitPayment,
  verifyPayment,
  getSettlementPlan,
  reconcileLeague,
} from "../controllers/financial.controller.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router({ mergeParams: true });

// All financial actions require valid JWT authentication
router.use(requireAuth);

router.get("/requirement", getPaymentRequirement);
router.post("/submit", submitPayment);
router.post("/verify", verifyPayment);
router.get("/settlement-plan", getSettlementPlan);
router.get("/reconcile", reconcileLeague);

export default router;
