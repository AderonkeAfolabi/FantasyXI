import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { verifyAccessToken } from "../config/jwt.js";
import { AuthUser } from "../types/index.js";

/**
 * Global declaration merging to extend Express Request with authenticated user.
 *
 * Laravel equivalent: The $request->user() helper available on Illuminate\Http\Request
 * once authenticated through auth:sanctum or auth:api.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Authentication middleware that requires a valid JWT Bearer token.
 * Rejects unauthenticated requests with HTTP 401.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      message: "Authentication required. Missing Authorization header.",
    });
    return;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    res.status(401).json({
      success: false,
      message:
        "Authentication required. Malformed Authorization header. Expected Bearer <token>.",
    });
    return;
  }

  const token = parts[1];

  try {
    const payload = verifyAccessToken(token);

    if (!payload.userId) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token payload.",
      });
      return;
    }

    req.user = {
      id: payload.userId,
      email: payload.email || "",
      username: payload.username || "",
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: "Token has expired",
      });
      return;
    }

    res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
    return;
  }
}

/**
 * Optional authentication middleware.
 * Attaches req.user if a valid token is present, but allows unauthenticated requests through.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    try {
      const payload = verifyAccessToken(parts[1]);
      if (payload.userId) {
        req.user = {
          id: payload.userId,
          email: payload.email || "",
          username: payload.username || "",
        };
      }
    } catch {
      // Ignore errors for optional authentication
    }
  }

  next();
}
