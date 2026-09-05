import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { StellarService } from "../services/financial/stellarService.js";

// Generate deterministic test keypairs
const senderKp = Keypair.random();
const destinationKp = Keypair.random();
const wrongDestinationKp = Keypair.random();

const VALID_TX_HASH =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const TEST_ISSUER =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWUIPWIO2LEOWOHR67K";

function createMockServer(overrides: {
  txRecord?: any;
  operations?: any[];
  accountBalances?: any[];
  txError?: any;
  accountError?: any;
}) {
  return {
    transactions: () => ({
      transaction: (hash: string) => ({
        call: async () => {
          if (overrides.txError) throw overrides.txError;
          return (
            overrides.txRecord || {
              hash,
              successful: true,
              ledger_attr: 1234567,
              created_at: "2026-09-04T12:00:00Z",
              memo: "LEAGUE:123:USER:456",
              memo_type: "text",
              source_account: senderKp.publicKey(),
            }
          );
        },
      }),
    }),
    operations: () => ({
      forTransaction: (_hash: string) => ({
        call: async () => ({
          records:
            overrides.operations !== undefined
              ? overrides.operations
              : [
                  {
                    id: "op_1",
                    type: "payment",
                    to: destinationKp.publicKey(),
                    from: senderKp.publicKey(),
                    amount: "5.0000000",
                    asset_type: "credit_alphanum4",
                    asset_code: "USDC",
                    asset_issuer: TEST_ISSUER,
                  },
                ],
        }),
      }),
    }),
    loadAccount: async (address: string) => {
      if (overrides.accountError) throw overrides.accountError;
      return {
        id: address,
        balances: overrides.accountBalances || [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: TEST_ISSUER,
            balance: "150.5000000",
          },
          {
            asset_type: "native",
            balance: "10.0000000",
          },
        ],
      };
    },
  } as any;
}

describe("StellarService Abstraction & Validation", () => {
  describe("Address and Hash Validation", () => {
    const service = new StellarService(createMockServer({}));

    it("should correctly validate Ed25519 public keys", () => {
      assert.equal(service.isValidStellarAddress(senderKp.publicKey()), true);
      assert.equal(service.isValidStellarAddress("G_INVALID_ADDRESS"), false);
      assert.equal(service.isValidStellarAddress(""), false);
    });

    it("should correctly validate 64-character hex transaction hashes", () => {
      assert.equal(service.isValidTransactionHash(VALID_TX_HASH), true);
      assert.equal(service.isValidTransactionHash("too-short"), false);
      assert.equal(
        service.isValidTransactionHash(VALID_TX_HASH + "extra_chars"),
        false
      );
      assert.equal(
        service.isValidTransactionHash("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"),
        false
      );
    });
  });

  describe("Payment Verification (verifyPaymentTransaction)", () => {
    it("should successfully verify a valid payment transaction", async () => {
      const mockServer = createMockServer({});
      const service = new StellarService(mockServer);

      const result = await service.verifyPaymentTransaction({
        txHash: VALID_TX_HASH,
        expectedDestination: destinationKp.publicKey(),
        expectedAmount: 5.0,
        expectedAssetCode: "USDC",
        expectedAssetIssuer: TEST_ISSUER,
        expectedMemo: "LEAGUE:123:USER:456",
        expectedSender: senderKp.publicKey(),
      });

      assert.equal(result.success, true);
      assert.equal(result.txHash, VALID_TX_HASH);
      assert.equal(result.amount, 5.0);
      assert.equal(result.destinationAddress, destinationKp.publicKey());
      assert.equal(result.senderAddress, senderKp.publicKey());
      assert.equal(result.ledgerSeq, 1234567);
      assert.ok(result.confirmedAt instanceof Date);
    });

    it("should reject an invalid transaction hash before making network calls", async () => {
      const service = new StellarService(createMockServer({}));
      const result = await service.verifyPaymentTransaction({
        txHash: "invalid_hash",
        expectedDestination: destinationKp.publicKey(),
        expectedAmount: 5.0,
      });

      assert.equal(result.success, false);
      assert.match(result.error!, /Invalid transaction hash format/);
    });

    it("should reject a transaction that failed on-chain", async () => {
      const mockServer = createMockServer({
        txRecord: {
          hash: VALID_TX_HASH,
          successful: false,
          ledger_attr: 1234567,
        },
      });
      const service = new StellarService(mockServer);

      const result = await service.verifyPaymentTransaction({
        txHash: VALID_TX_HASH,
        expectedDestination: destinationKp.publicKey(),
        expectedAmount: 5.0,
      });

      assert.equal(result.success, false);
      assert.match(result.error!, /failed on the Stellar network/);
    });

    it("should reject a transaction with mismatched memo", async () => {
      const mockServer = createMockServer({
        txRecord: {
          hash: VALID_TX_HASH,
          successful: true,
          ledger_attr: 1234567,
          memo: "LEAGUE:WRONG:USER:999",
        },
      });
      const service = new StellarService(mockServer);

      const result = await service.verifyPaymentTransaction({
        txHash: VALID_TX_HASH,
        expectedDestination: destinationKp.publicKey(),
        expectedAmount: 5.0,
        expectedMemo: "LEAGUE:123:USER:456",
      });

      assert.equal(result.success, false);
      assert.match(result.error!, /Memo mismatch/);
    });

    it("should reject a transaction with incorrect amount", async () => {
      const mockServer = createMockServer({
        operations: [
          {
            id: "op_1",
            type: "payment",
            to: destinationKp.publicKey(),
            from: senderKp.publicKey(),
            amount: "3.0000000", // Paid 3 instead of 5
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: TEST_ISSUER,
          },
        ],
      });
      const service = new StellarService(mockServer);

      const result = await service.verifyPaymentTransaction({
        txHash: VALID_TX_HASH,
        expectedDestination: destinationKp.publicKey(),
        expectedAmount: 5.0,
        expectedAssetCode: "USDC",
        expectedAssetIssuer: TEST_ISSUER,
      });

      assert.equal(result.success, false);
      assert.match(result.error!, /No valid payment operation found/);
    });

    it("should reject a transaction with incorrect destination address", async () => {
      const mockServer = createMockServer({
        operations: [
          {
            id: "op_1",
            type: "payment",
            to: wrongDestinationKp.publicKey(), // Sent to wrong address
            from: senderKp.publicKey(),
            amount: "5.0000000",
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: TEST_ISSUER,
          },
        ],
      });
      const service = new StellarService(mockServer);

      const result = await service.verifyPaymentTransaction({
        txHash: VALID_TX_HASH,
        expectedDestination: destinationKp.publicKey(),
        expectedAmount: 5.0,
      });

      assert.equal(result.success, false);
      assert.match(result.error!, /No valid payment operation found/);
    });

    it("should reject a transaction with incorrect asset code", async () => {
      const mockServer = createMockServer({
        operations: [
          {
            id: "op_1",
            type: "payment",
            to: destinationKp.publicKey(),
            from: senderKp.publicKey(),
            amount: "5.0000000",
            asset_type: "native", // Paid XLM instead of USDC
          },
        ],
      });
      const service = new StellarService(mockServer);

      const result = await service.verifyPaymentTransaction({
        txHash: VALID_TX_HASH,
        expectedDestination: destinationKp.publicKey(),
        expectedAmount: 5.0,
        expectedAssetCode: "USDC",
      });

      assert.equal(result.success, false);
      assert.match(result.error!, /No valid payment operation found/);
    });

    it("should gracefully handle 404 Not Found from Horizon", async () => {
      const mockServer = createMockServer({
        txError: { response: { status: 404 }, name: "NotFoundError" },
      });
      const service = new StellarService(mockServer);

      const result = await service.verifyPaymentTransaction({
        txHash: VALID_TX_HASH,
        expectedDestination: destinationKp.publicKey(),
        expectedAmount: 5.0,
      });

      assert.equal(result.success, false);
      assert.match(result.error!, /Transaction not found on Stellar network/);
    });
  });

  describe("Balance Lookup (getAccountUsdcBalance)", () => {
    it("should return the correct balance when account has USDC trustline", async () => {
      const mockServer = createMockServer({
        accountBalances: [
          {
            asset_code: "USDC",
            asset_issuer: TEST_ISSUER,
            balance: "250.7500000",
          },
        ],
      });
      const service = new StellarService(mockServer);

      const balance = await service.getAccountUsdcBalance(
        senderKp.publicKey(),
        "USDC",
        TEST_ISSUER
      );
      assert.equal(balance, 250.75);
    });

    it("should return 0 when account has no USDC trustline", async () => {
      const mockServer = createMockServer({
        accountBalances: [
          {
            asset_type: "native",
            balance: "50.0000000",
          },
        ],
      });
      const service = new StellarService(mockServer);

      const balance = await service.getAccountUsdcBalance(
        senderKp.publicKey(),
        "USDC",
        TEST_ISSUER
      );
      assert.equal(balance, 0);
    });

    it("should return 0 when account does not exist on network (404)", async () => {
      const mockServer = createMockServer({
        accountError: { response: { status: 404 } },
      });
      const service = new StellarService(mockServer);

      const balance = await service.getAccountUsdcBalance(
        senderKp.publicKey(),
        "USDC",
        TEST_ISSUER
      );
      assert.equal(balance, 0);
    });

    it("should throw for an invalid Stellar public key", async () => {
      const service = new StellarService(createMockServer({}));

      await assert.rejects(
        async () => {
          await service.getAccountUsdcBalance("invalid_address");
        },
        /Invalid Stellar address/
      );
    });
  });

  describe("Soroban Contract Queries and Ledger Reconciliation", () => {
    const mockSorobanClient: any = {
      getLeague: async (leagueId: number | bigint) => {
        if (Number(leagueId) === 999) return null;
        return {
          creator: senderKp.publicKey(),
          entry_fee: 100_000_000n, // 10 USDC
          participant_count: 3,
          status: 1, // Active
          total_deposited: 300_000_000n, // 30 USDC
        };
      },
      getDeposit: async (_leagueId: number | bigint, _participant: string) => {
        return 100_000_000n;
      },
      getTokenBalance: async (_address: string) => {
        return 300_000_000n;
      },
    };

    it("should query on-chain league state from Soroban client", async () => {
      const service = new StellarService(createMockServer({}), mockSorobanClient);
      const state = await service.getContractLeagueState(101);
      assert.ok(state);
      assert.strictEqual(state?.creator, senderKp.publicKey());
      assert.strictEqual(state?.entry_fee, 100_000_000n);
      assert.strictEqual(state?.participant_count, 3);
      assert.strictEqual(state?.total_deposited, 300_000_000n);
    });

    it("should query participant deposit amount from Soroban client", async () => {
      const service = new StellarService(createMockServer({}), mockSorobanClient);
      const dep = await service.getContractDeposit(101, senderKp.publicKey());
      assert.strictEqual(dep, 100_000_000n);
    });

    it("should query contract token balance from Soroban client", async () => {
      const service = new StellarService(createMockServer({}), mockSorobanClient);
      const bal = await service.getContractTokenBalance(destinationKp.publicKey());
      assert.strictEqual(bal, 300_000_000n);
    });

    it("should reconcile balanced on-chain ledger with database expectations", async () => {
      const service = new StellarService(createMockServer({}), mockSorobanClient);
      // DB has 3 participants x 10 USDC = 30 USDC expected
      const report = await service.reconcileWithContract(101, 30.0, 3);
      assert.strictEqual(report.onChainBalanced, true);
      assert.strictEqual(report.onChainDepositedUsdc, 30);
      assert.strictEqual(report.onChainParticipantCount, 3);
      assert.strictEqual(report.onChainStatus, "Active");
      assert.strictEqual(report.discrepancyUsdc, 0);
    });

    it("should detect discrepancy when on-chain deposits differ from database", async () => {
      const service = new StellarService(createMockServer({}), mockSorobanClient);
      // DB expected 40 USDC (4 members), but on-chain only has 30 USDC (3 members)
      const report = await service.reconcileWithContract(101, 40.0, 4);
      assert.strictEqual(report.onChainBalanced, false);
      assert.strictEqual(report.onChainDepositedUsdc, 30);
      assert.strictEqual(report.onChainParticipantCount, 3);
      assert.strictEqual(report.discrepancyUsdc, 10);
    });

    it("should throw when league is not found on Soroban contract", async () => {
      const service = new StellarService(createMockServer({}), mockSorobanClient);
      await assert.rejects(
        async () => {
          await service.reconcileWithContract(999, 10.0, 1);
        },
        /League 999 not found on Soroban contract/
      );
    });
  });
});
