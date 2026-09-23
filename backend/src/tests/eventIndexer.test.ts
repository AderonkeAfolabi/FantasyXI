import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { EscrowEventIndexer, INDEXER_CURSOR_ID } from "../workers/eventIndexer.js";
import {
  toContractLeagueId,
  leagueIdPrefixFromContractId,
} from "../services/financial/contractLeagueId.js";
import { MembershipStatus, PaymentStatus, TransactionStatus } from "../types/index.js";

const LEAGUE_ID = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const participant = Keypair.random().publicKey();

function depositEvent(txHash: string, ledger = 500, address = participant) {
  return {
    id: `${ledger}-1`,
    type: "contract",
    ledger,
    ledgerClosedAt: "2026-09-20T12:00:00Z",
    transactionIndex: 1,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash,
    topic: [
      xdr.ScVal.scvSymbol("deposit"),
      nativeToScVal(toContractLeagueId(LEAGUE_ID), { type: "u64" }),
    ],
    value: nativeToScVal([
      nativeToScVal(address, { type: "address" }),
      nativeToScVal(100_000_000n, { type: "i128" }),
    ]),
  } as any;
}

function createMockDb(memberOverrides: any = {}) {
  const state = {
    cursor: null as any,
    member: {
      id: "member_1",
      userId: "user_1",
      leagueId: LEAGUE_ID,
      status: MembershipStatus.PENDING,
      paymentStatus: PaymentStatus.PAYMENT_INITIATED,
      stellarAddress: null,
      walletAddress: participant,
      ...memberOverrides,
    },
    transactions: new Map<string, any>(),
  };
  const db: any = {
    state,
    indexerCursor: {
      findUnique: async () => state.cursor,
      upsert: async ({ create, update }: any) => {
        state.cursor = state.cursor ? { ...state.cursor, ...update } : create;
      },
    },
    league: {
      findFirst: async ({ where }: any) =>
        LEAGUE_ID.startsWith(where.id.startsWith) ? { id: LEAGUE_ID } : null,
    },
    leagueMember: {
      findFirst: async ({ where }: any) => {
        const [byMember, byWallet] = where.OR;
        const m = state.member;
        return where.leagueId === m.leagueId &&
          (byMember.stellarAddress === m.stellarAddress ||
            byWallet.user.wallet.stellarAddress === m.walletAddress)
          ? m
          : null;
      },
      update: async ({ data }: any) => Object.assign(state.member, data),
    },
    transaction: {
      upsert: async ({ where, create, update }: any) => {
        const existing = state.transactions.get(where.stellarTxHash);
        state.transactions.set(where.stellarTxHash, existing ? { ...existing, ...update } : create);
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  return db;
}

function createMockStellar(pages: any[], latestLedger = 1000) {
  const requests: any[] = [];
  return {
    requests,
    getEscrowContractEvents: async (params: any) => {
      requests.push(params);
      const page = pages.shift();
      if (page instanceof Error) throw page;
      return page ?? { events: [], cursor: params.cursor ?? "c0", latestLedger };
    },
    getRpcLedgerRange: async () => ({ oldestLedger: 10, latestLedger }),
  } as any;
}

describe("Soroban Escrow Event Indexer", () => {
  it("maps contract league ids back to the league UUID prefix", () => {
    assert.equal(leagueIdPrefixFromContractId(toContractLeagueId(LEAGUE_ID)), "3f2a9c1e-7b4d-4e8a");
  });

  it("confirms a deposit found on-chain and records the transaction", async () => {
    const db = createMockDb();
    const stellar = createMockStellar([{ events: [depositEvent("a".repeat(64))], cursor: "c1", latestLedger: 600 }]);

    assert.equal(await new EscrowEventIndexer({ db, stellar, startLedger: 400 }).pollOnce(), 1);

    assert.equal(db.state.member.paymentStatus, PaymentStatus.PAYMENT_CONFIRMED);
    assert.equal(db.state.member.status, MembershipStatus.ACTIVE);
    assert.equal(db.state.member.stellarAddress, participant);
    const tx = db.state.transactions.get("a".repeat(64));
    assert.equal(tx.status, TransactionStatus.CONFIRMED);
    assert.equal(tx.amount, 10);
    assert.equal(tx.ledgerSeq, 500);
    assert.deepEqual(stellar.requests[0], { startLedger: 400, limit: 100 });
  });

  it("is idempotent when the same event is processed twice", async () => {
    const db = createMockDb();
    const event = depositEvent("b".repeat(64));
    const indexer = new EscrowEventIndexer({ db, stellar: createMockStellar([]) });

    await indexer.handleEvent(event);
    await indexer.handleEvent(event);

    assert.equal(db.state.transactions.size, 1);
    assert.equal(db.state.member.paymentStatus, PaymentStatus.PAYMENT_CONFIRMED);
  });

  it("never reverts a refunded member when replaying an old deposit", async () => {
    const db = createMockDb({ paymentStatus: PaymentStatus.REFUNDED, status: MembershipStatus.REFUNDED });
    const indexer = new EscrowEventIndexer({ db, stellar: createMockStellar([]) });

    assert.equal(await indexer.handleEvent(depositEvent("c".repeat(64))), false);
    assert.equal(db.state.member.paymentStatus, PaymentStatus.REFUNDED);
  });

  it("ignores deposits from unknown participants", async () => {
    const db = createMockDb();
    const indexer = new EscrowEventIndexer({ db, stellar: createMockStellar([]) });
    const stranger = Keypair.random().publicKey();

    assert.equal(await indexer.handleEvent(depositEvent("d".repeat(64), 500, stranger)), false);
    assert.equal(db.state.transactions.size, 0);
  });

  it("persists the cursor and resumes from it after a restart", async () => {
    const db = createMockDb();
    const first = createMockStellar([{ events: [depositEvent("e".repeat(64), 777)], cursor: "cursor-777", latestLedger: 800 }]);
    await new EscrowEventIndexer({ db, stellar: first, startLedger: 700 }).pollOnce();
    assert.deepEqual(db.state.cursor, { id: INDEXER_CURSOR_ID, lastLedger: 777, cursor: "cursor-777" });

    // New process: picks up the stored cursor instead of the configured start ledger
    const second = createMockStellar([]);
    await new EscrowEventIndexer({ db, stellar: second, startLedger: 1 }).pollOnce();
    assert.deepEqual(second.requests[0], { cursor: "cursor-777", limit: 100 });
  });

  it("restarts from the oldest retained ledger when the cursor expired", async () => {
    const db = createMockDb();
    db.state.cursor = { id: INDEXER_CURSOR_ID, lastLedger: 5, cursor: "stale" };
    const stellar = createMockStellar([new Error("startLedger must be within the ledger range: 10 - 1000")]);

    await new EscrowEventIndexer({ db, stellar }).pollOnce();
    assert.deepEqual(stellar.requests[1], { startLedger: 10, limit: 100 });
  });

  it("propagates RPC errors so the worker backs off", async () => {
    const db = createMockDb();
    const stellar = createMockStellar([new Error("Request failed with status code 429")]);
    await assert.rejects(() => new EscrowEventIndexer({ db, stellar }).pollOnce(), /429/);
    assert.equal(db.state.cursor, null);
  });

  it("uses capped exponential backoff", () => {
    const delays = [1, 2, 3, 4, 8].map((n) => EscrowEventIndexer.backoffDelay(n, 1000, 10_000));
    assert.deepEqual(delays, [1000, 2000, 4000, 8000, 10_000]);
  });
});
