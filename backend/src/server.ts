import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiV1Router from "./routes/index.js";
import { EscrowEventIndexer } from "./workers/eventIndexer.js";

dotenv.config();

const app = express();

// ============================================================
// Middleware
// ============================================================

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// ============================================================
// Routes
// ============================================================

app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "FantasyXI API",
    version: "0.2.0",
    status: "running",
  });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "FantasyXI API is running",
    timestamp: new Date().toISOString(),
  });
});

// API v1 Routes
app.use("/api/v1", apiV1Router);
app.use("/api", apiV1Router);


// ============================================================
// Global error handler
// ============================================================

/**
 * Express error-handling middleware.
 *
 * Laravel equivalent: This is like your app/Exceptions/Handler.php —
 * a single place that catches all unhandled errors and returns a
 * consistent JSON response.
 *
 * The 4-parameter signature (err, req, res, next) tells Express
 * this is an error handler, not a regular middleware.
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);

  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// ============================================================
// Start server
// ============================================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
  ⚽ FantasyXI API Server
  ────────────────────────
  Port:     ${PORT}
  Env:      ${process.env.NODE_ENV || "development"}
  URL:      http://localhost:${PORT}
  Health:   http://localhost:${PORT}/api/health
  `);

  // Soroban escrow event indexer (set EVENT_INDEXER_ENABLED=false to disable)
  if (
    process.env.DATABASE_URL &&
    process.env.STELLAR_ESCROW_CONTRACT_ID &&
    process.env.EVENT_INDEXER_ENABLED !== "false"
  ) {
    const startLedger = Number(process.env.EVENT_INDEXER_START_LEDGER) || undefined;
    new EscrowEventIndexer({ startLedger }).start();
  }
});