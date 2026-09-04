import { PrizeDistribution } from "../../types/index.js";

/**
 * Deterministic Prize & Platform Fee Calculation Service.
 *
 * Implements exact integer cents arithmetic to guarantee:
 * - 5% platform fee
 * - 95% prize pool
 * - 60% (1st) / 30% (2nd) / 10% (3rd) prize breakdown
 * - Zero floating-point rounding errors (suitable for future on-chain Stellar/Soroban settlement)
 *
 * Laravel equivalent: Like a dedicated Financial/PrizeCalculationService.
 */
export class PrizeService {
  public static readonly PLATFORM_FEE_PERCENT = 5;
  public static readonly FIRST_PLACE_PERCENT = 60;
  public static readonly SECOND_PLACE_PERCENT = 30;
  public static readonly THIRD_PLACE_PERCENT = 10;

  // 2-player competition breakdown
  public static readonly TWO_PLAYER_FIRST_PERCENT = 70;
  public static readonly TWO_PLAYER_SECOND_PERCENT = 30;

  /**
   * Calculates the exact prize pool and payout distribution.
   * Uses cents arithmetic to eliminate floating-point drift.
   */
  public static calculatePrizeDistribution(
    participantCount: number,
    entryFee: number
  ): PrizeDistribution {
    if (participantCount < 0 || entryFee < 0) {
      throw new Error("Participant count and entry fee must be non-negative");
    }

    const feeInCents = Math.round(entryFee * 100);
    const count = Math.floor(participantCount);

    if (count === 0 || feeInCents === 0) {
      return {
        participantCount: count,
        entryFee: feeInCents / 100,
        grossTotal: 0,
        platformFee: 0,
        prizePool: 0,
        prizes: {
          first: 0,
          second: 0,
          third: 0,
        },
      };
    }

    const grossCents = count * feeInCents;
    const platformFeeCents = Math.round(
      (grossCents * this.PLATFORM_FEE_PERCENT) / 100
    );
    const prizePoolCents = grossCents - platformFeeCents;

    let firstCents = 0;
    let secondCents = 0;
    let thirdCents = 0;

    if (count >= 3) {
      firstCents = Math.round(
        (prizePoolCents * this.FIRST_PLACE_PERCENT) / 100
      );
      secondCents = Math.round(
        (prizePoolCents * this.SECOND_PLACE_PERCENT) / 100
      );
      // Remainder guarantees first + second + third === prizePoolCents (no lost cents)
      thirdCents = prizePoolCents - firstCents - secondCents;
    } else if (count === 2) {
      firstCents = Math.round(
        (prizePoolCents * this.TWO_PLAYER_FIRST_PERCENT) / 100
      );
      secondCents = prizePoolCents - firstCents;
      thirdCents = 0;
    } else {
      // 1 participant (cannot have a competitive contest)
      firstCents = prizePoolCents;
      secondCents = 0;
      thirdCents = 0;
    }

    return {
      participantCount: count,
      entryFee: feeInCents / 100,
      grossTotal: grossCents / 100,
      platformFee: platformFeeCents / 100,
      prizePool: prizePoolCents / 100,
      prizes: {
        first: firstCents / 100,
        second: secondCents / 100,
        third: thirdCents / 100,
      },
    };
  }
}
