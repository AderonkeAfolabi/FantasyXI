import { Request, Response, NextFunction } from "express";
import {
  authService,
  AuthValidationError,
  AuthConflictError,
  AuthUnauthorizedError,
  AuthNotFoundError,
} from "../services/auth/authService.js";

/**
 * Authentication Controller.
 *
 * Handles HTTP requests for registration, login, and authenticated user profile.
 *
 * Laravel equivalent: App\Http\Controllers\Auth\AuthenticatedSessionController and
 * RegisteredUserController.
 */

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof AuthValidationError) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }
    if (error instanceof AuthConflictError) {
      res.status(409).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await authService.login(req.body);
    res.json({
      success: true,
      message: "Logged in successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof AuthUnauthorizedError) {
      res.status(401).json({
        success: false,
        message: error.message,
      });
      return;
    }
    if (error instanceof AuthValidationError) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    const user = await authService.getMe(req.user.id);
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error instanceof AuthNotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}
