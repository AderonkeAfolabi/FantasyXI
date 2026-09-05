/**
 * Stellar Service — Horizon & Soroban Network Abstraction
 *
 * Laravel analogy: Like a dedicated PaymentGateway client or StripeService.
 * Handles read queries and transaction verification against the Stellar Testnet.
 * Never executes state changes on the database directly; returns pure verification results.
 */

import { Horizon, StrKey } from "@stellar/stellar-sdk";
import { getHorizonServer, stellarConfig } from "../../config/stellar.js";
import { PaymentVerificationResult } from "../../types/index.js";
import {
  SorobanContractClient,
  OnChainLeagueState,
} from "./sorobanContractClient.js";

export interface VerifyPaymentParams {
  txHash: string;
  expectedDestination: string;
  expectedAmount: number;
  expectedAssetCode?: string;
  expectedAssetIssuer?: string;
  expectedMemo?: string;
  expectedSender?: string;
}

export interface ContractReconciliationResult {
  onChainBalanced: boolean;
  onChainDepositedUsdc: number;
  onChainParticipantCount: number;
  onChainStatus: string;
  discrepancyUsdc: number;
}

export class StellarService {
  private server: Horizon.Server;
  private sorobanClient?: SorobanContractClient;

  constructor(
    customServer?: Horizon.Server,
    customSorobanClient?: SorobanContractClient
  ) {
    this.server = customServer || getHorizonServer();
    this.sorobanClient = customSorobanClient;
  }

  public getSorobanClient(): SorobanContractClient | null {
    if (this.sorobanClient) return this.sorobanClient;
    try {
      this.sorobanClient = new SorobanContractClient();
      return this.sorobanClient;
    } catch {
      return null;
    }
  }

  /**
   * Validate whether a string is a valid Stellar Ed25519 public key (G...)
   * or a valid Soroban Contract ID (C...).
   */
  public isValidStellarAddress(address: string): boolean {
    if (!address || typeof address !== "string") return false;
    return (
      StrKey.isValidEd25519PublicKey(address) ||
      StrKey.isValidContract(address)
    );
  }

  /**
   * Validate whether a string is a valid 64-hexadecimal Stellar transaction hash.
   */
  public isValidTransactionHash(hash: string): boolean {
    if (!hash || typeof hash !== "string") return false;
    return /^[0-9a-fA-F]{64}$/.test(hash);
  }

  /**
   * Verify an on-chain payment transaction against expected competition parameters.
   *
   * Verifies:
   * 1. Transaction exists and was successful on-chain.
   * 2. Transaction is confirmed in a finalized ledger.
   * 3. Memo matches expected reference string (if specified).
   * 4. Contains a payment operation with:
   *    - Correct destination address
   *    - Correct asset code & issuer
   *    - Correct amount (exact within decimal epsilon)
   *    - Correct sender address (if specified)
   */
  public async verifyPaymentTransaction(
    params: VerifyPaymentParams
  ): Promise<PaymentVerificationResult> {
    const {
      txHash,
      expectedDestination,
      expectedAmount,
      expectedAssetCode = stellarConfig.usdcAssetCode,
      expectedAssetIssuer = stellarConfig.usdcIssuer,
      expectedMemo,
      expectedSender,
    } = params;

    if (!this.isValidTransactionHash(txHash)) {
      return {
        success: false,
        txHash,
        error: "Invalid transaction hash format. Expected 64-character hex string.",
      };
    }

    try {
      // 1. Fetch transaction record from Horizon
      const tx = await this.server.transactions().transaction(txHash).call();

      if (!tx.successful) {
        return {
          success: false,
          txHash,
          ledgerSeq: tx.ledger_attr,
          error: "Transaction failed on the Stellar network.",
        };
      }

      // 2. Check memo if specified
      if (expectedMemo) {
        if (!tx.memo || tx.memo.trim() !== expectedMemo.trim()) {
          return {
            success: false,
            txHash,
            ledgerSeq: tx.ledger_attr,
            error: `Memo mismatch: expected '${expectedMemo}', found '${tx.memo || "none"}'.`,
          };
        }
      }

      // 3. Fetch operations for this transaction
      const opsPage = await this.server
        .operations()
        .forTransaction(txHash)
        .call();

      // 4. Find payment operation matching criteria
      const matchingOp = opsPage.records.find((op: any) => {
        // We look for payment operations
        if (op.type !== "payment") return false;

        // Check destination
        if (op.to !== expectedDestination) return false;

        // Check asset
        const isNative = op.asset_type === "native";
        if (expectedAssetCode === "XLM") {
          if (!isNative) return false;
        } else {
          if (op.asset_code !== expectedAssetCode) return false;
          if (expectedAssetIssuer && op.asset_issuer !== expectedAssetIssuer) {
            return false;
          }
        }

        // Check amount (compare with 0.000001 precision)
        const parsedAmount = parseFloat(op.amount);
        if (Math.abs(parsedAmount - expectedAmount) > 0.00001) return false;

        // Check sender if specified
        if (expectedSender && op.from !== expectedSender && tx.source_account !== expectedSender) {
          return false;
        }

        return true;
      }) as any;

      if (!matchingOp) {
        return {
          success: false,
          txHash,
          ledgerSeq: tx.ledger_attr,
          error: `No valid payment operation found matching destination ${expectedDestination}, asset ${expectedAssetCode}, and amount ${expectedAmount}.`,
        };
      }

      return {
        success: true,
        txHash: tx.hash,
        ledgerSeq: tx.ledger_attr,
        amount: parseFloat(matchingOp.amount),
        assetCode: matchingOp.asset_code || "XLM",
        senderAddress: matchingOp.from || tx.source_account,
        destinationAddress: matchingOp.to,
        confirmedAt: new Date(tx.created_at),
      };
    } catch (error: any) {
      // Check for 404 Not Found from Horizon
      if (
        error?.response?.status === 404 ||
        error?.name === "NotFoundError" ||
        error?.message?.includes("Not Found")
      ) {
        return {
          success: false,
          txHash,
          error: "Transaction not found on Stellar network or ledger not yet closed.",
        };
      }

      return {
        success: false,
        txHash,
        error: `Stellar network error: ${error?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Look up the current USDC balance for a given Stellar account.
   * Returns 0 if account doesn't exist or has no USDC trustline.
   */
  public async getAccountUsdcBalance(
    stellarAddress: string,
    assetCode: string = stellarConfig.usdcAssetCode,
    assetIssuer: string = stellarConfig.usdcIssuer
  ): Promise<number> {
    if (!this.isValidStellarAddress(stellarAddress)) {
      throw new Error(`Invalid Stellar address: ${stellarAddress}`);
    }

    try {
      const account = await this.server.loadAccount(stellarAddress);
      const usdcBalance = account.balances.find((b: any) => {
        if (assetCode === "XLM") return b.asset_type === "native";
        return b.asset_code === assetCode && b.asset_issuer === assetIssuer;
      });

      if (!usdcBalance) return 0;
      return parseFloat(usdcBalance.balance);
    } catch (error: any) {
      if (error?.response?.status === 404 || error?.name === "NotFoundError") {
        return 0; // Account not created on network yet
      }
      throw error;
    }
  }

  /**
   * Fetch on-chain league state from Soroban escrow contract.
   */
  public async getContractLeagueState(
    leagueId: number | bigint
  ): Promise<OnChainLeagueState | null> {
    const client = this.getSorobanClient();
    if (!client) {
      throw new Error("Soroban contract client is not configured");
    }
    return client.getLeague(leagueId);
  }

  /**
   * Fetch on-chain participant deposit amount from Soroban escrow contract.
   */
  public async getContractDeposit(
    leagueId: number | bigint,
    participantAddress: string
  ): Promise<bigint> {
    const client = this.getSorobanClient();
    if (!client) {
      throw new Error("Soroban contract client is not configured");
    }
    return client.getDeposit(leagueId, participantAddress);
  }

  /**
   * Fetch USDC SAC token balance from Soroban for an account or contract address.
   */
  public async getContractTokenBalance(
    addressOrContractId: string
  ): Promise<bigint> {
    const client = this.getSorobanClient();
    if (!client) {
      throw new Error("Soroban contract client is not configured");
    }
    return client.getTokenBalance(addressOrContractId);
  }

  /**
   * Reconcile database expectations with live on-chain Soroban escrow state.
   */
  public async reconcileWithContract(
    leagueId: number | bigint,
    dbExpectedDepositsUsdc: number,
    dbParticipantCount: number
  ): Promise<ContractReconciliationResult> {
    const state = await this.getContractLeagueState(leagueId);
    if (!state) {
      throw new Error(`League ${leagueId} not found on Soroban contract`);
    }

    // Convert stroops to USDC (7 decimals)
    const onChainDepositedUsdc = Number(state.total_deposited) / 10_000_000;
    const discrepancyUsdc = Math.abs(dbExpectedDepositsUsdc - onChainDepositedUsdc);
    const countMatches = state.participant_count === dbParticipantCount;
    const isBalanced = discrepancyUsdc < 0.0001 && countMatches;

    const statusNames = ["Upcoming", "Active", "Settled", "Cancelled"];

    return {
      onChainBalanced: isBalanced,
      onChainDepositedUsdc,
      onChainParticipantCount: state.participant_count,
      onChainStatus: statusNames[state.status] || "Unknown",
      discrepancyUsdc: parseFloat(discrepancyUsdc.toFixed(4)),
    };
  }
}

export const stellarService = new StellarService();
