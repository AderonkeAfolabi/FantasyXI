import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SquadService,
  SquadForbiddenError,
} from "../services/squad/squadService.js";
import {
  LeagueService,
  LeagueForbiddenError,
} from "../services/league/leagueService.js";
import { LeagueStatus } from "../types/index.js";

describe("Authorization & Ownership Enforcement", () => {
  describe("Squad Ownership Rules", () => {
    it("should reject User A attempting to update User B's squad with SquadForbiddenError", async () => {
      const mockSquads = [
        {
          id: "sq_user_b",
          userId: "user_b_id",
          name: "User B XI",
          budgetRemaining: 5.0,
        },
      ];

      const mockDb = {
        squad: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            return mockSquads.find((s) => s.id === where.id) || null;
          },
        },
        gameweek: {
          findFirst: async () => null, // No deadline lock in this test
        },
      };

      const squadService = new SquadService(mockDb);

      await assert.rejects(
        async () => {
          await squadService.updateSquad(
            "sq_user_b",
            { name: "Hacked Name", players: [] },
            "user_a_id" // User A attempting to modify User B's squad
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof SquadForbiddenError);
          assert.match(err.message, /not authorized to modify this squad/i);
          return true;
        }
      );
    });
  });

  describe("League Ownership Rules", () => {
    it("should reject User A attempting to cancel User B's league with LeagueForbiddenError", async () => {
      const mockLeagues = [
        {
          id: "lg_user_b",
          creatorId: "user_b_id",
          status: LeagueStatus.UPCOMING,
          name: "User B Private Cup",
        },
      ];

      const mockDb = {
        league: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            return mockLeagues.find((l) => l.id === where.id) || null;
          },
        },
      };

      const leagueService = new LeagueService(mockDb);

      await assert.rejects(
        async () => {
          await leagueService.cancelLeague(
            "lg_user_b",
            "user_a_id" // User A attempting to cancel User B's league
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof LeagueForbiddenError);
          assert.match(err.message, /only the league creator has permission to cancel/i);
          return true;
        }
      );
    });
  });
});
