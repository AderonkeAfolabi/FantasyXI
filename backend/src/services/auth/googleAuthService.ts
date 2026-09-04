import { OAuth2Client } from "google-auth-library";
import { getOAuth2Client, getGoogleConfig } from "../../config/google.js";
import { AuthValidationError, AuthUnauthorizedError } from "./authService.js";

/**
 * Verified user identity returned from Google OpenID Connect ID token.
 */
export interface VerifiedGoogleUser {
  googleId: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  emailVerified: boolean;
}

/**
 * Service managing Google OAuth 2.0 / OpenID Connect operations.
 *
 * Laravel equivalent: Laravel Socialite's Google Provider
 * (Laravel\Socialite\Two\GoogleProvider).
 */
export class GoogleAuthService {
  private readonly clientId: string;

  constructor(private readonly client: OAuth2Client = getOAuth2Client()) {
    this.clientId = getGoogleConfig().clientId;
  }

  /**
   * Generates the Google OAuth authorization URL.
   */
  public getAuthorizationUrl(state: string): string {
    return this.client.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      state,
      prompt: "select_account",
    });
  }

  /**
   * Exchanges authorization code for tokens, cryptographically verifies the ID token,
   * and extracts the verified identity claims.
   */
  public async verifyAuthorizationCode(
    code: string
  ): Promise<VerifiedGoogleUser> {
    if (!code || typeof code !== "string") {
      throw new AuthValidationError("Authorization code is required");
    }

    try {
      // 1. Exchange code for tokens
      const { tokens } = await this.client.getToken(code);

      if (!tokens.id_token) {
        throw new AuthUnauthorizedError(
          "Google did not return an OpenID Connect ID token"
        );
      }

      // 2. Verify ID token signature, audience, issuer, and expiration
      const ticket = await this.client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.sub || !payload.email) {
        throw new AuthUnauthorizedError(
          "Invalid or incomplete Google ID token payload"
        );
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name ?? null,
        picture: payload.picture ?? null,
        emailVerified: Boolean(payload.email_verified),
      };
    } catch (error) {
      if (
        error instanceof AuthValidationError ||
        error instanceof AuthUnauthorizedError
      ) {
        throw error;
      }
      throw new AuthUnauthorizedError("Failed to verify Google authentication");
    }
  }
}

export const googleAuthService = new GoogleAuthService();
