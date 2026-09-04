import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import dotenv from "dotenv";
import { getJwtSecret } from "./jwt.js";

dotenv.config();

/**
 * Centralized Google OAuth 2.0 / OpenID Connect Configuration.
 *
 * Laravel equivalent: config/services.php ['google'] configuration
 * used by Laravel Socialite.
 */

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export function getGoogleConfig(): GoogleOAuthConfig {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      "http://localhost:5000/api/v1/auth/google/callback",
  };
}

export function isGoogleOAuthConfigured(): boolean {
  const config = getGoogleConfig();
  return Boolean(
    config.clientId &&
      config.clientSecret &&
      !config.clientId.includes("your-google-client-id")
  );
}

/**
 * Returns a configured Google OAuth2Client instance.
 */
export function getOAuth2Client(): OAuth2Client {
  const config = getGoogleConfig();
  return new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.callbackUrl
  );
}

/**
 * 10-minute state lifetime to protect against CSRF attacks.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

interface StatePayload {
  nonce: string;
  timestamp: number;
  returnTo?: string;
}

/**
 * Generates an HMAC-signed CSRF state parameter.
 */
export function generateOAuthState(returnTo?: string): string {
  const payload: StatePayload = {
    nonce: crypto.randomBytes(16).toString("hex"),
    timestamp: Date.now(),
    returnTo: returnTo || "/",
  };

  const jsonPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  const secret = getJwtSecret();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(jsonPayload)
    .digest("base64url");

  return `${jsonPayload}.${signature}`;
}

/**
 * Validates the HMAC signature and expiration of an OAuth state parameter.
 */
export function verifyOAuthState(stateString: string): {
  valid: boolean;
  returnTo?: string;
} {
  if (!stateString || typeof stateString !== "string") {
    return { valid: false };
  }

  const parts = stateString.split(".");
  if (parts.length !== 2) {
    return { valid: false };
  }

  const [jsonPayload, signature] = parts;
  const secret = getJwtSecret();
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(jsonPayload)
    .digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false };
  }

  try {
    const raw = Buffer.from(jsonPayload, "base64url").toString("utf-8");
    const payload: StatePayload = JSON.parse(raw);

    // Verify freshness (within 10 minutes, and not in the future beyond clock skew)
    const now = Date.now();
    if (now - payload.timestamp > STATE_TTL_MS || payload.timestamp > now + 60000) {
      return { valid: false };
    }

    return { valid: true, returnTo: payload.returnTo };
  } catch {
    return { valid: false };
  }
}
