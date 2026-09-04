import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PrizeService } from "../services/league/prizeService.js";

describe("PrizeService Deterministic Calculations", () => {
  it("should calculate exact 5% fee and 60/30/10 prize distribution for 10 players x 5 USDC", () => {
    const result = PrizeService.calculatePrizeDistribution(10, 5.0);

    assert.equal(result.participantCount, 10);
    assert.equal(result.entryFee, 5.0);
    assert.equal(result.grossTotal, 50.0);
    assert.equal(result.platformFee, 2.5);
    assert.equal(result.prizePool, 47.5);
    assert.equal(result.prizes.first, 28.5);
    assert.equal(result.prizes.second, 14.25);
    assert.equal(result.prizes.third, 4.75);

    // Sum of prizes must exactly equal prize pool
    const prizeSum =
      result.prizes.first + result.prizes.second + result.prizes.third;
    assert.equal(Math.round(prizeSum * 100) / 100, result.prizePool);
  });

  it("should calculate exact distribution for 2-player league (70/30)", () => {
    const result = PrizeService.calculatePrizeDistribution(2, 10.0);

    assert.equal(result.grossTotal, 20.0);
    assert.equal(result.platformFee, 1.0); // 5% of 20 = 1.00
    assert.equal(result.prizePool, 19.0); // 95% of 20 = 19.00
    assert.equal(result.prizes.first, 13.3); // 70% of 19 = 13.30
    assert.equal(result.prizes.second, 5.7); // 30% of 19 = 5.70
    assert.equal(result.prizes.third, 0);

    const prizeSum = result.prizes.first + result.prizes.second;
    assert.equal(Math.round(prizeSum * 100) / 100, result.prizePool);
  });

  it("should handle odd numbers without penny loss (e.g. 7 players x 3.50 USDC)", () => {
    const result = PrizeService.calculatePrizeDistribution(7, 3.5);

    // 7 * 3.50 = 24.50
    assert.equal(result.grossTotal, 24.5);
    // Platform fee 5%: 24.50 * 0.05 = 1.225 -> 1.23
    assert.equal(result.platformFee, 1.23);
    // Prize pool: 24.50 - 1.23 = 23.27
    assert.equal(result.prizePool, 23.27);

    const prizeSum =
      result.prizes.first + result.prizes.second + result.prizes.third;
    assert.equal(Math.round(prizeSum * 100) / 100, result.prizePool);
  });

  it("should handle free league (0 entry fee)", () => {
    const result = PrizeService.calculatePrizeDistribution(20, 0);

    assert.equal(result.grossTotal, 0);
    assert.equal(result.platformFee, 0);
    assert.equal(result.prizePool, 0);
    assert.equal(result.prizes.first, 0);
    assert.equal(result.prizes.second, 0);
    assert.equal(result.prizes.third, 0);
  });

  it("should throw for negative inputs", () => {
    assert.throws(
      () => PrizeService.calculatePrizeDistribution(-1, 5),
      /must be non-negative/
    );
    assert.throws(
      () => PrizeService.calculatePrizeDistribution(5, -10),
      /must be non-negative/
    );
  });
});
