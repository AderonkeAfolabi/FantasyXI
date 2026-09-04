/**
 * External FPL API Client.
 *
 * Provides typed methods to query the official Fantasy Premier League endpoints:
 * - /bootstrap-static/ (teams, players, gameweeks)
 * - /fixtures/ (match fixtures)
 * - /event/{gw}/live/ (live player stats per gameweek)
 *
 * Implements a simple in-memory cache to prevent hammering the upstream FPL API.
 *
 * Laravel equivalent: Like a dedicated ThirdParty/FplService using Http::timeout()->withHeaders().
 */

const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class FplClient {
  private cache = new Map<string, CacheEntry<unknown>>();
  private baseUrl: string;

  constructor(baseUrl: string = FPL_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic fetch wrapper with in-memory caching and standard User-Agent header.
   */
  private async get<T>(endpoint: string, ttlMs: number = 300_000): Promise<T> {
    const cacheKey = endpoint;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "FantasyXI-App/1.0 (Educational open-source fantasy football project)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `FPL API request failed: [${response.status}] ${response.statusText} at ${url}`
      );
    }

    const data = (await response.json()) as T;
    this.cache.set(cacheKey, {
      data,
      expiresAt: Date.now() + ttlMs,
    });

    return data;
  }

  /**
   * Clear the in-memory cache manually (e.g. before an explicit force-sync).
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Fetches the core FPL dataset:
   * - events (all 38 gameweeks with deadlines)
   * - teams (all 20 Premier League clubs)
   * - elements (all ~600 players with current prices, totals, form)
   */
  public async getBootstrapStatic(): Promise<{
    events: Array<{
      id: number;
      name: string;
      deadline_time: string;
      is_current: boolean;
      finished: boolean;
    }>;
    teams: Array<{
      id: number;
      name: string;
      short_name: string;
      strength?: number;
      strength_overall_home?: number;
      strength_overall_away?: number;
      strength_attack_home?: number;
      strength_attack_away?: number;
      strength_defence_home?: number;
      strength_defence_away?: number;
    }>;
    elements: Array<{
      id: number;
      first_name: string;
      second_name: string;
      web_name: string;
      element_type: number; // 1 = GKP, 2 = DEF, 3 = MID, 4 = FWD
      team: number;
      now_cost: number; // Tenths of a million: e.g. 105 = 10.5m
      total_points: number;
      minutes: number;
      goals_scored: number;
      assists: number;
      clean_sheets: number;
      form?: string;
      status?: string;
      news?: string;
      chance_of_playing_next_round?: number | null;
      selected_by_percent?: string;
      photo?: string;
    }>;
  }> {
    return this.get("/bootstrap-static/", 180_000); // 3-minute cache
  }

  /**
   * Fetches fixtures for the entire season or filtered by gameweek event ID.
   */
  public async getFixtures(eventId?: number): Promise<
    Array<{
      id: number;
      event: number | null;
      team_h: number;
      team_a: number;
      kickoff_time: string | null;
      started: boolean;
      finished: boolean;
      team_h_score: number | null;
      team_a_score: number | null;
      minutes: number;
    }>
  > {
    const endpoint = eventId !== undefined ? `/fixtures/?event=${eventId}` : "/fixtures/";
    return this.get(endpoint, 120_000); // 2-minute cache
  }

  /**
   * Fetches live match stats for a specific gameweek.
   * Contains detailed stats for every player (minutes, goals, clean sheets, bonus, total points).
   */
  public async getGameweekLive(gameweekId: number): Promise<{
    elements: Array<{
      id: number;
      stats: {
        minutes: number;
        goals_scored: number;
        assists: number;
        clean_sheets: number;
        goals_conceded?: number;
        own_goals?: number;
        penalties_saved?: number;
        penalties_missed?: number;
        yellow_cards: number;
        red_cards: number;
        saves: number;
        bonus: number;
        total_points: number;
      };
    }>;
  }> {
    return this.get(`/event/${gameweekId}/live/`, 60_000); // 1-minute cache
  }
}

export const fplClient = new FplClient();
