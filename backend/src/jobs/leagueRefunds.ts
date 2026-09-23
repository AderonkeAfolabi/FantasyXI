import { prisma } from "../config/db.js";
import { LeagueStatus, PaymentStatus } from "../types/index.js";
import { leagueService } from "../services/league/leagueService.js";
import { financialService } from "../services/financial/financialService.js";

/**
 * League Refund Job.
 *
 * 1. Cancels UPCOMING leagues that missed minMembers by their start gameweek kickoff.
 * 2. Dispatches batched on-chain refunds for every cancelled league with paid members
 *    (covers both automatic and creator/admin cancellations).
 * 3. Verifies the escrow holds nothing for fully refunded leagues.
 * Throws when any batch failed so the queue retries; refunds are idempotent.
 */
export async function processLeagueRefunds(): Promise<void> {
  const cancelled = await leagueService.cancelUnderfilledLeagues();
  if (cancelled.length > 0) {
    console.log(`[jobs] Cancelled underfilled leagues: ${cancelled.join(", ")}`);
  }

  const leagues = await prisma.league.findMany({
    where: {
      status: LeagueStatus.CANCELLED,
      members: {
        some: {
          paymentStatus: {
            in: [PaymentStatus.REFUND_PENDING, PaymentStatus.PAYMENT_CONFIRMED],
          },
          stellarAddress: { not: null },
        },
      },
    },
    select: { id: true },
  });

  const failures: string[] = [];
  for (const { id } of leagues) {
    const report = await financialService.processLeagueRefunds(id);
    console.log(
      `[jobs] League ${id}: refunded ${report.refundedMemberIds.length} member(s) in ${report.batches} batch(es), ` +
        `${report.failedBatches.length} failed, ${report.skippedMemberIds.length} without wallet`
    );

    if (report.failedBatches.length > 0) {
      failures.push(id);
      continue;
    }

    const reconciliation = await financialService.verifyRefundReconciliation(id);
    console.log(
      `[jobs] League ${id} escrow reconciliation: remaining=${reconciliation.remainingEscrowStroops} stroops, ` +
        `fullyRefunded=${reconciliation.isFullyRefunded}`
    );
  }

  if (failures.length > 0) {
    throw new Error(`Refund batches failed for league(s): ${failures.join(", ")}`);
  }
}
