/**
 * Soroban Contract Client for FantasyXI Escrow & Token SAC
 *
 * Provides typed methods to interact with:
 * 1. FantasyXI Escrow Contract (initialize, create_league, deposit, settle, refund, get_league, get_deposit)
 * 2. Testnet USDC SAC (balance)
 *
 * Analogous in Laravel to a dedicated SmartContractGateway or BlockchainRpcService.
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load testnet deployment configuration
const envTestnetPath = path.resolve(process.cwd(), ".env.testnet.local");
if (fs.existsSync(envTestnetPath)) {
  dotenv.config({ path: envTestnetPath });
}

export interface OnChainLeagueState {
  creator: string;
  entry_fee: bigint;
  participant_count: number;
  status: number; // 0 = Upcoming, 1 = Active, 2 = Settled, 3 = Cancelled
  total_deposited: bigint;
}

export interface WinnerPayoutParam {
  winner: string;
  amount: string; // stroops as string e.g. "171000000"
}

export interface InvocationResult {
  success: boolean;
  txHash?: string;
  output?: string;
  error?: string;
  contractErrorCode?: number;
}

export class SorobanContractClient {
  private stellarCliPath: string;
  private escrowContractId: string;
  private usdcContractId: string;
  private network: string;

  constructor(options?: {
    stellarCliPath?: string;
    escrowContractId?: string;
    usdcContractId?: string;
    network?: string;
  }) {
    this.stellarCliPath =
      options?.stellarCliPath ||
      path.resolve(process.cwd(), "..", "tools", "bin", "stellar.exe");
    this.escrowContractId =
      options?.escrowContractId || process.env.STELLAR_ESCROW_CONTRACT_ID || "";
    this.usdcContractId =
      options?.usdcContractId ||
      process.env.STELLAR_USDC_TOKEN_CONTRACT_ID ||
      "";
    this.network = options?.network || "testnet";

    if (!fs.existsSync(this.stellarCliPath)) {
      throw new Error(`Stellar CLI binary not found at: ${this.stellarCliPath}`);
    }
    if (!this.escrowContractId) {
      throw new Error("STELLAR_ESCROW_CONTRACT_ID not provided or set in environment.");
    }
  }

  public getEscrowContractId(): string {
    return this.escrowContractId;
  }

  public getUsdcContractId(): string {
    return this.usdcContractId;
  }

  /**
   * Execute raw contract invocation via stellar-cli and parse outputs/errors.
   */
  public executeInvoke(params: {
    contractId: string;
    sourceSecret: string;
    functionName: string;
    args: string[];
    isView?: boolean;
  }): InvocationResult {
    const { contractId, sourceSecret, functionName, args, isView } = params;

    const cliArgs = [
      "contract",
      "invoke",
      "--id",
      contractId,
      "--source-account",
      sourceSecret,
      "--network",
      this.network,
    ];

    if (isView) {
      cliArgs.push("--send=no");
    }

    cliArgs.push("--", functionName, ...args);

    const result = spawnSync(this.stellarCliPath, cliArgs, {
      encoding: "utf-8",
    });

    const stdout = (result.stdout || "").trim();
    const stderr = (result.stderr || "").trim();
    const combined = `${stdout}\n${stderr}`.trim();

    if (result.status !== 0) {
      // Check for contract error code e.g. Error(Contract, #7)
      const errMatch = combined.match(/Error\(Contract,\s*#(\d+)\)/);
      const contractErrorCode = errMatch ? parseInt(errMatch[1], 10) : undefined;

      return {
        success: false,
        error: combined || `Process exited with code ${result.status}`,
        contractErrorCode,
      };
    }

    // Extract transaction hash if available from stderr or stdout
    const txMatch = combined.match(
      /(?:explorer\/testnet\/tx\/|transaction:\s*)([0-9a-fA-F]{64})/i
    );
    const txHash = txMatch ? txMatch[1] : undefined;

    return {
      success: true,
      txHash,
      output: stdout,
    };
  }

  /**
   * Create competition partition identified by `league_id`.
   */
  public async createLeague(
    creatorSecret: string,
    creatorPublic: string,
    leagueId: number | bigint,
    entryFeeStroops: bigint
  ): Promise<InvocationResult> {
    return this.executeInvoke({
      contractId: this.escrowContractId,
      sourceSecret: creatorSecret,
      functionName: "create_league",
      args: [
        "--creator",
        creatorPublic,
        "--league_id",
        leagueId.toString(),
        "--entry_fee",
        entryFeeStroops.toString(),
      ],
    });
  }

  /**
   * Deposit entry fee into league partition.
   */
  public async deposit(
    participantSecret: string,
    participantPublic: string,
    leagueId: number | bigint
  ): Promise<InvocationResult> {
    return this.executeInvoke({
      contractId: this.escrowContractId,
      sourceSecret: participantSecret,
      functionName: "deposit",
      args: [
        "--participant",
        participantPublic,
        "--league_id",
        leagueId.toString(),
      ],
    });
  }

  /**
   * Admin settles the league with winner payouts and platform treasury fee.
   */
  public async settle(
    adminSecret: string,
    adminPublic: string,
    leagueId: number | bigint,
    winners: WinnerPayoutParam[],
    platformTreasury: string,
    platformFeeStroops: bigint
  ): Promise<InvocationResult> {
    // Write winners to a temporary JSON file to ensure bulletproof quoting on Windows
    const tmpFilePath = path.resolve(
      process.cwd(),
      `.tmp_winners_${leagueId}_${Date.now()}.json`
    );
    try {
      fs.writeFileSync(tmpFilePath, JSON.stringify(winners), "utf-8");

      return this.executeInvoke({
        contractId: this.escrowContractId,
        sourceSecret: adminSecret,
        functionName: "settle",
        args: [
          "--admin",
          adminPublic,
          "--league_id",
          leagueId.toString(),
          "--winners-file-path",
          tmpFilePath,
          "--platform_treasury",
          platformTreasury,
          "--platform_fee",
          platformFeeStroops.toString(),
        ],
      });
    } finally {
      if (fs.existsSync(tmpFilePath)) {
        fs.unlinkSync(tmpFilePath);
      }
    }
  }

  /**
   * Admin refunds deposits for cancelled league.
   */
  public async refund(
    adminSecret: string,
    adminPublic: string,
    leagueId: number | bigint,
    participants: string[]
  ): Promise<InvocationResult> {
    const tmpFilePath = path.resolve(
      process.cwd(),
      `.tmp_refund_${leagueId}_${Date.now()}.json`
    );
    try {
      fs.writeFileSync(tmpFilePath, JSON.stringify(participants), "utf-8");

      return this.executeInvoke({
        contractId: this.escrowContractId,
        sourceSecret: adminSecret,
        functionName: "refund",
        args: [
          "--admin",
          adminPublic,
          "--league_id",
          leagueId.toString(),
          "--participants-file-path",
          tmpFilePath,
        ],
      });
    } finally {
      if (fs.existsSync(tmpFilePath)) {
        fs.unlinkSync(tmpFilePath);
      }
    }
  }

  /**
   * Query on-chain league state.
   */
  public async getLeague(
    leagueId: number | bigint
  ): Promise<OnChainLeagueState | null> {
    const adminSecret = process.env.TESTNET_ADMIN_SECRET || "";
    const result = this.executeInvoke({
      contractId: this.escrowContractId,
      sourceSecret: adminSecret,
      functionName: "get_league",
      args: ["--league_id", leagueId.toString()],
      isView: true,
    });

    if (!result.success || !result.output) {
      return null;
    }

    // Output may contain diagnostic or log lines followed by JSON or null
    const lines = result.output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1];

    if (lastLine === "null") return null;

    try {
      const parsed = JSON.parse(lastLine);
      return {
        creator: parsed.creator,
        entry_fee: BigInt(parsed.entry_fee),
        participant_count: Number(parsed.participant_count),
        status: Number(parsed.status),
        total_deposited: BigInt(parsed.total_deposited),
      };
    } catch {
      return null;
    }
  }

  /**
   * Query on-chain participant deposit amount.
   */
  public async getDeposit(
    leagueId: number | bigint,
    participantPublic: string
  ): Promise<bigint> {
    const adminSecret = process.env.TESTNET_ADMIN_SECRET || "";
    const result = this.executeInvoke({
      contractId: this.escrowContractId,
      sourceSecret: adminSecret,
      functionName: "get_deposit",
      args: ["--league_id", leagueId.toString(), "--participant", participantPublic],
      isView: true,
    });

    if (!result.success || !result.output) return 0n;

    const lines = result.output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1].replace(/"/g, "");
    return BigInt(lastLine || "0");
  }

  /**
   * Query USDC SAC balance for any account (or contract ID).
   */
  public async getTokenBalance(addressOrContractId: string): Promise<bigint> {
    const adminSecret = process.env.TESTNET_ADMIN_SECRET || "";
    const result = this.executeInvoke({
      contractId: this.usdcContractId,
      sourceSecret: adminSecret,
      functionName: "balance",
      args: ["--id", addressOrContractId],
      isView: true,
    });

    if (!result.success || !result.output) return 0n;

    const lines = result.output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1].replace(/"/g, "");
    return BigInt(lastLine || "0");
  }
}
