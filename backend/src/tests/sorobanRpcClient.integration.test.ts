/**
 * Native Soroban RPC client — Stellar Testnet integration tests.
 *
 * Runs the full simulate -> assemble -> sign -> send -> poll pipeline against
 * Stellar Testnet RPC using the deployment in .env.testnet.local
 * (see src/scripts/testnetDeployer.ts). Skipped when those variables are missing.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { SorobanContractClient } from "../services/financial/sorobanContractClient.js";

const env = process.env;
const configured = Boolean(
  env.STELLAR_ESCROW_CONTRACT_ID &&
    env.STELLAR_USDC_TOKEN_CONTRACT_ID &&
    env.TESTNET_ADMIN_SECRET &&
    env.TESTNET_MANAGER_A_SECRET &&
    env.TESTNET_MANAGER_B_SECRET
);

// Escrow error codes from contracts/src/lib.rs
const ALREADY_INITIALIZED = 1;
const LEAGUE_NOT_ACCEPTING_DEPOSITS = 5;

describe("SorobanContractClient (Stellar Testnet RPC)", { skip: !configured && "testnet env not configured" }, () => {
  let client: SorobanContractClient;
  const adminPublic = env.TESTNET_ADMIN_PUBLIC!;
  const adminSecret = env.TESTNET_ADMIN_SECRET!;
  const managerAPublic = env.TESTNET_MANAGER_A_PUBLIC!;
  const managerASecret = env.TESTNET_MANAGER_A_SECRET!;
  const managerBPublic = env.TESTNET_MANAGER_B_PUBLIC!;
  const managerBSecret = env.TESTNET_MANAGER_B_SECRET!;
  const ENTRY_FEE = 10_000_000n; // 1 USDC
  const refundLeagueId = BigInt(Date.now());
  const settleLeagueId = refundLeagueId + 1n;

  before(async () => {
    client = new SorobanContractClient();
    const init = await client.initialize(adminSecret, adminPublic, client.getUsdcContractId());
    assert.ok(
      init.success || init.contractErrorCode === ALREADY_INITIALIZED,
      `initialize failed: ${init.error}`
    );
  });

  it("simulates read-only calls without submitting", async () => {
    assert.equal(await client.getLeague(refundLeagueId), null);
    assert.equal(await client.getDeposit(refundLeagueId, managerAPublic), 0n);
    assert.ok((await client.getTokenBalance(managerAPublic)) > 0n);
  });

  it("creates a league on-chain and reads its state back", async () => {
    const res = await client.createLeague(adminSecret, adminPublic, refundLeagueId, ENTRY_FEE);
    assert.equal(res.success, true, res.error ?? "");
    assert.match(res.txHash!, /^[0-9a-f]{64}$/);

    const state = await client.getLeague(refundLeagueId);
    assert.deepEqual(state, {
      creator: adminPublic,
      entry_fee: ENTRY_FEE,
      participant_count: 0,
      status: 0,
      total_deposited: 0n,
    });
  });

  it("deposits the entry fee into escrow", async () => {
    const escrowBefore = await client.getTokenBalance(client.getEscrowContractId());
    const res = await client.deposit(managerASecret, managerAPublic, refundLeagueId);
    assert.equal(res.success, true, res.error ?? "");

    assert.equal(await client.getDeposit(refundLeagueId, managerAPublic), ENTRY_FEE);
    assert.equal(await client.getTokenBalance(client.getEscrowContractId()), escrowBefore + ENTRY_FEE);
  });

  it("refunds participants and cancels the league", async () => {
    const res = await client.refund(adminSecret, adminPublic, refundLeagueId, [managerAPublic]);
    assert.equal(res.success, true, res.error ?? "");
    assert.equal(await client.getDeposit(refundLeagueId, managerAPublic), 0n);
    assert.equal((await client.getLeague(refundLeagueId))?.status, 3);
  });

  it("surfaces contract errors from failed simulations", async () => {
    const res = await client.deposit(managerBSecret, managerBPublic, refundLeagueId);
    assert.equal(res.success, false);
    assert.equal(res.contractErrorCode, LEAGUE_NOT_ACCEPTING_DEPOSITS);
  });

  it("settles a league with winner payouts and platform fee", async () => {
    assert.equal((await client.createLeague(adminSecret, adminPublic, settleLeagueId, ENTRY_FEE)).success, true);
    assert.equal((await client.deposit(managerASecret, managerAPublic, settleLeagueId)).success, true);
    assert.equal((await client.deposit(managerBSecret, managerBPublic, settleLeagueId)).success, true);

    const winnerBefore = await client.getTokenBalance(managerAPublic);
    const res = await client.settle(
      adminSecret,
      adminPublic,
      settleLeagueId,
      [{ winner: managerAPublic, amount: "19000000" }],
      adminPublic,
      1_000_000n
    );
    assert.equal(res.success, true, res.error ?? "");
    assert.equal(await client.getTokenBalance(managerAPublic), winnerBefore + 19_000_000n);
    assert.equal((await client.getLeague(settleLeagueId))?.status, 2);
  });
});
