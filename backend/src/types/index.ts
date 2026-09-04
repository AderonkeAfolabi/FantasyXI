/**
 * Shared TypeScript types and enums for the FantasyXI backend.
 *
 * These mirror the Prisma schema enums and define request/response shapes
 * used across controllers, services, and middleware.
 *
 * Laravel equivalent: These are like Form Request validation types +
 * API Resource shapes combined.
 */

// ============================================================
// Enums — must match the Prisma schema exactly
// ============================================================

export enum Position {
  GKP = "GKP",
  DEF = "DEF",
  MID = "MID",
  FWD = "FWD",
}

export enum LeagueStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
}

export enum ScoringType {
  CLASSIC = "CLASSIC",
  HEAD_TO_HEAD = "HEAD_TO_HEAD",
}

export enum TransactionType {
  DEPOSIT = "DEPOSIT",
  WITHDRAWAL = "WITHDRAWAL",
  ENTRY_FEE = "ENTRY_FEE",
  PRIZE = "PRIZE",
}

export enum TransactionStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  FAILED = "FAILED",
}

// ============================================================
// Squad composition constants
// ============================================================

export const SQUAD_RULES = {
  /** Total number of players in a full squad */
  TOTAL_PLAYERS: 15,
  /** Number of starting players */
  STARTERS: 11,
  /** Number of bench players */
  BENCH: 4,
  /** Required count per position */
  POSITION_COUNTS: {
    [Position.GKP]: 2,
    [Position.DEF]: 5,
    [Position.MID]: 5,
    [Position.FWD]: 3,
  } as const,
  /** Minimum starters per position (for valid formations) */
  MIN_STARTERS: {
    [Position.GKP]: 1,
    [Position.DEF]: 3,
    [Position.MID]: 2,
    [Position.FWD]: 1,
  } as const,
  /** Maximum players from a single Premier League team */
  MAX_PER_TEAM: 3,
  /** Starting budget in £ millions */
  STARTING_BUDGET: 100.0,
} as const;

// ============================================================
// API request/response types
// ============================================================

/** Shape of a JWT payload after decoding */
export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
}

/** POST /api/auth/register */
export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
}

/** POST /api/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Standard auth response */
export interface AuthResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}

/** Standard API error response */
export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}

/** Standard API success response */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

// ============================================================
// Fixture & Fantasy Squad Input Types
// ============================================================

export interface FixtureData {
  id: number;
  fplId: number;
  gameweekId: number | null;
  homeTeamId: number;
  awayTeamId: number;
  kickoffTime: string | null;
  started: boolean;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
  minutes: number;
}

export interface SquadPlayerSelection {
  playerId: number;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  positionOrder: number; // 1 to 15
}

export interface CreateSquadInput {
  name: string;
  userId: string;
  players: SquadPlayerSelection[];
}

export interface UpdateSquadInput {
  name?: string;
  players: SquadPlayerSelection[];
}

export interface PlayerFilterQuery {
  search?: string;
  position?: Position;
  teamId?: number;
  minPrice?: number;
  maxPrice?: number;
  isAvailable?: boolean;
  sortBy?: "price" | "totalPoints" | "goalsScored" | "assists" | "form";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

