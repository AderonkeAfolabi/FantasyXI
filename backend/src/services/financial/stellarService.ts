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

export interface VerifyPaymentParams {
  txHash: string;
  expectedDestination: string;
  expectedAmount: number;
  expectedAssetCode?: string;
  expectedAssetIssuer?: string;
  expectedMemo?: string;
  expectedSender?: string;
}

export class StellarService {
  private server: Horizon.Server;

  constructor(customServer?: Horizon.Server) {
    this.server = customServer || getHorizonServer();
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
}

export const stellarService = new StellarService();
