import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma as defaultPrisma } from "../../config/db.js";
import { signAccessToken } from "../../config/jwt.js";
import {
  RegisterInput,
  LoginInput,
  SafeUser,
  AuthResult,
} from "../../types/index.js";

/**
 * Custom error classes for Authentication domain rules.
 *
 * Laravel equivalent: FormRequest validation exceptions and AuthenticationException.
 */

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthValidationError";
  }
}

export class AuthConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConflictError";
  }
}

export class AuthUnauthorizedError extends Error {
  constructor(message: string = "Invalid email or password") {
    super(message);
    this.name = "AuthUnauthorizedError";
  }
}

export class AuthNotFoundError extends Error {
  constructor(message: string = "User not found") {
    super(message);
    this.name = "AuthNotFoundError";
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export function toSafeUser(user: {
  id: string;
  email: string;
  username: string;
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SafeUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Authentication Service.
 *
 * Handles user registration, bcrypt password hashing, login verification,
 * JWT generation, and profile retrieval.
 *
 * Laravel equivalent: Laravel Fortify / Breeze authentication actions:
 *   RegistersUsers, AuthenticatesUsers, Hash::make, Hash::check.
 */
export class AuthService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any = defaultPrisma) {}

  /**
   * Normalizes an email address consistently.
   */
  public normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Validates registration inputs.
   */
  public validateRegisterInput(input: RegisterInput): {
    normalizedEmail: string;
    normalizedUsername?: string;
  } {
    if (!input.email || typeof input.email !== "string") {
      throw new AuthValidationError("Email is required");
    }

    const normalizedEmail = this.normalizeEmail(input.email);
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new AuthValidationError("Invalid email address format");
    }

    if (!input.password || typeof input.password !== "string") {
      throw new AuthValidationError("Password is required");
    }

    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new AuthValidationError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
      );
    }

    let normalizedUsername: string | undefined;
    if (input.username) {
      normalizedUsername = input.username.trim().toLowerCase();
      if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
        throw new AuthValidationError(
          "Username must be between 3 and 30 characters"
        );
      }
      if (!/^[a-z0-9_-]+$/.test(normalizedUsername)) {
        throw new AuthValidationError(
          "Username can only contain letters, numbers, underscores, and dashes"
        );
      }
    }

    return { normalizedEmail, normalizedUsername };
  }

  /**
   * Generates a candidate username from display name or email prefix.
   */
  private generateBaseUsername(email: string, name?: string): string {
    const raw = name ? name : email.split("@")[0];
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 20);
    return cleaned.length >= 3 ? cleaned : `user_${cleaned}`;
  }

  /**
   * Registers a new user account with bcrypt hashed password.
   */
  public async register(input: RegisterInput): Promise<AuthResult> {
    const { normalizedEmail, normalizedUsername } =
      this.validateRegisterInput(input);

    // Check duplicate email
    const existingEmail = await this.db.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingEmail) {
      throw new AuthConflictError("An account with this email already exists");
    }

    // Determine final username
    let finalUsername = normalizedUsername;
    if (finalUsername) {
      const existingUser = await this.db.user.findUnique({
        where: { username: finalUsername },
      });
      if (existingUser) {
        throw new AuthConflictError("Username is already taken");
      }
    } else {
      const base = this.generateBaseUsername(normalizedEmail, input.name);
      finalUsername = base;
      const existingBase = await this.db.user.findUnique({
        where: { username: finalUsername },
      });
      if (existingBase) {
        finalUsername = `${base}_${crypto.randomBytes(2).toString("hex")}`;
      }
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    // Persist user
    const user = await this.db.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        username: finalUsername,
        name: input.name ? input.name.trim() : null,
      },
    });

    const safeUser = toSafeUser(user);
    const token = signAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    return {
      user: safeUser,
      token,
    };
  }

  /**
   * Authenticates user with email and password.
   * Returns generic 401 message on any credential mismatch to prevent enumeration.
   */
  public async login(input: LoginInput): Promise<AuthResult> {
    if (!input.email || !input.password) {
      throw new AuthUnauthorizedError("Invalid email or password");
    }

    const normalizedEmail = this.normalizeEmail(input.email);

    const user = await this.db.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Timing-safe / generic rejection if user does not exist
    if (!user) {
      throw new AuthUnauthorizedError("Invalid email or password");
    }

    // Compare with bcrypt
    const isPasswordValid = await bcrypt.compare(
      input.password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new AuthUnauthorizedError("Invalid email or password");
    }

    const safeUser = toSafeUser(user);
    const token = signAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    return {
      user: safeUser,
      token,
    };
  }

  /**
   * Retrieves safe user profile by ID.
   */
  public async getMe(userId: string): Promise<SafeUser> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AuthNotFoundError("User not found");
    }

    return toSafeUser(user);
  }
}

export const authService = new AuthService();
