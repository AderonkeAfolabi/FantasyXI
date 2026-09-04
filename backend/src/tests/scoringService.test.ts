import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ScoringService } from "../services/scoring/scoringService.js";
import { Position } from "../types/index.js";

describe("ScoringService Domain Rules", () => {
  // Lineup helper: 4-4-2 setup
  function createLineup() {
    return [
      // Starters (1-11)
      { playerId: 1, position: Position.GKP, isStarter: true, isCaptain: true, isViceCaptain: false, positionOrder: 1 },
      { playerId: 2, position: Position.DEF, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 2 },
      { playerId: 3, position: Position.DEF, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 3 },
      { playerId: 4, position: Position.DEF, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 4 },
      { playerId: 5, position: Position.DEF, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 5 },
      { playerId: 6, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: true, positionOrder: 6 },
      { playerId: 7, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 7 },
      { playerId: 8, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 8 },
      { playerId: 9, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 9 },
      { playerId: 10, position: Position.FWD, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 10 },
      { playerId: 11, position: Position.FWD, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 11 },

      // Bench (12-15)
      { playerId: 12, position: Position.GKP, isStarter: false, isCaptain: false, isViceCaptain: false, positionOrder: 12 },
      { playerId: 13, position: Position.MID, isStarter: false, isCaptain: false, isViceCaptain: false, positionOrder: 13 }, // 1st bench outfield
      { playerId: 14, position: Position.DEF, isStarter: false, isCaptain: false, isViceCaptain: false, positionOrder: 14 }, // 2nd bench outfield
      { playerId: 15, position: Position.FWD, isStarter: false, isCaptain: false, isViceCaptain: false, positionOrder: 15 }, // 3rd bench outfield
    ];
  }

  it("should calculate standard player points and apply 2x captain multiplier", () => {
    const lineup = createLineup();
    const statsMap = new Map<number, { minutes: number; totalPoints: number }>();

    // Captain (Player 1) scores 6 points (should double to 12)
    statsMap.set(1, { minutes: 90, totalPoints: 6 });
    // Vice-captain (Player 6) scores 8 points (no multiplier since captain played)
    statsMap.set(6, { minutes: 90, totalPoints: 8 });

    // Other starters score 2 points each
    for (let id = 2; id <= 11; id++) {
      if (id !== 6) {
        statsMap.set(id, { minutes: 90, totalPoints: 2 });
      }
    }

    // Bench players score 1 point each
    for (let id = 12; id <= 15; id++) {
      statsMap.set(id, { minutes: 90, totalPoints: 1 });
    }

    const result = ScoringService.calculateLineupScore(lineup, statsMap);

    // Starting XI: 12 (C) + 8 (VC) + 9 starters * 2 = 12 + 8 + 18 = 38 points
    assert.equal(result.startingPoints, 38);
    assert.equal(result.captainPoints, 6);
    assert.equal(result.benchPoints, 4); // 4 bench players * 1 point
    assert.equal(result.totalPoints, 38);
  });

  it("should transfer 2x multiplier to vice-captain when captain plays 0 minutes", () => {
    const lineup = createLineup();
    const statsMap = new Map<number, { minutes: number; totalPoints: number }>();

    // Captain (Player 1) did not play (0 minutes, 0 points)
    statsMap.set(1, { minutes: 0, totalPoints: 0 });
    // Bench GKP (Player 12) played and got 4 points
    statsMap.set(12, { minutes: 90, totalPoints: 4 });
    // Vice-captain (Player 6) scored 7 points (should double to 14)
    statsMap.set(6, { minutes: 90, totalPoints: 7 });

    // Other starters get 2 points each
    for (let id = 2; id <= 11; id++) {
      if (id !== 6) {
        statsMap.set(id, { minutes: 90, totalPoints: 2 });
      }
    }

    const result = ScoringService.calculateLineupScore(lineup, statsMap);

    // Vice-captain gets doubled: 14 points
    const vcDetail = result.details.find((d) => d.playerId === 6)!;
    assert.equal(vcDetail.multiplier, 2);
    assert.equal(vcDetail.effectivePoints, 14);

    // Bench GKP subbed in for Player 1
    const subGkp = result.details.find((d) => d.playerId === 12)!;
    assert.equal(subGkp.subbedIn, true);
  });

  it("should perform auto-substitution with first eligible bench player", () => {
    const lineup = createLineup();
    const statsMap = new Map<number, { minutes: number; totalPoints: number }>();

    // Forward 10 played 0 minutes
    statsMap.set(10, { minutes: 0, totalPoints: 0 });
    // Bench priority 1 (Player 13, MID) played and scored 5 points
    statsMap.set(13, { minutes: 90, totalPoints: 5 });

    // All other starters played
    for (let id = 1; id <= 11; id++) {
      if (id !== 10) {
        statsMap.set(id, { minutes: 90, totalPoints: 2 });
      }
    }

    const result = ScoringService.calculateLineupScore(lineup, statsMap);

    // Player 10 subbed out
    const fwd10 = result.details.find((d) => d.playerId === 10)!;
    assert.equal(fwd10.subbedOut, true);

    // Player 13 (MID) subbed in (formation shifts from 4-4-2 to 4-5-1, which is legal)
    const mid13 = result.details.find((d) => d.playerId === 13)!;
    assert.equal(mid13.subbedIn, true);
  });

  it("should preserve minimum 3 defenders rule during auto-substitution", () => {
    // Setup a 3-5-2 lineup (minimum 3 defenders starting)
    const lineup = [
      { playerId: 1, position: Position.GKP, isStarter: true, isCaptain: true, isViceCaptain: false, positionOrder: 1 },
      { playerId: 2, position: Position.DEF, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 2 },
      { playerId: 3, position: Position.DEF, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 3 },
      { playerId: 4, position: Position.DEF, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 4 }, // Only 3 DEF!
      { playerId: 6, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: true, positionOrder: 5 },
      { playerId: 7, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 6 },
      { playerId: 8, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 7 },
      { playerId: 9, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 8 },
      { playerId: 10, position: Position.MID, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 9 },
      { playerId: 11, position: Position.FWD, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 10 },
      { playerId: 12, position: Position.FWD, isStarter: true, isCaptain: false, isViceCaptain: false, positionOrder: 11 },

      // Bench: GKP, MID (pos 13), DEF (pos 14), FWD (pos 15)
      { playerId: 5, position: Position.GKP, isStarter: false, isCaptain: false, isViceCaptain: false, positionOrder: 12 },
      { playerId: 13, position: Position.MID, isStarter: false, isCaptain: false, isViceCaptain: false, positionOrder: 13 }, // 1st bench (MID)
      { playerId: 14, position: Position.DEF, isStarter: false, isCaptain: false, isViceCaptain: false, positionOrder: 14 }, // 2nd bench (DEF)
      { playerId: 15, position: Position.FWD, isStarter: false, isCaptain: false, isViceCaptain: false, positionOrder: 15 },
    ];

    const statsMap = new Map<number, { minutes: number; totalPoints: number }>();

    // Starter DEF 4 played 0 minutes
    statsMap.set(4, { minutes: 0, totalPoints: 0 });
    // Bench MID 13 played and got 6 points
    statsMap.set(13, { minutes: 90, totalPoints: 6 });
    // Bench DEF 14 played and got 4 points
    statsMap.set(14, { minutes: 90, totalPoints: 4 });

    // Other starters played
    for (const p of lineup) {
      if (![4, 13, 14].includes(p.playerId)) {
        statsMap.set(p.playerId, { minutes: 90, totalPoints: 2 });
      }
    }

    const result = ScoringService.calculateLineupScore(lineup, statsMap);

    // Even though MID 13 was 1st on bench, bringing on a midfielder would leave only 2 defenders (illegal!).
    // Therefore, DEF 14 MUST be subbed in instead to keep 3 defenders!
    const mid13 = result.details.find((d) => d.playerId === 13)!;
    const def14 = result.details.find((d) => d.playerId === 14)!;

    assert.equal(mid13.subbedIn, false);
    assert.equal(def14.subbedIn, true);
  });
});
