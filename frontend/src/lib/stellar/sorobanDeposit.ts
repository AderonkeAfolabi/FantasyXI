/**
 * Frontend Soroban Escrow Deposit Helper
 *
 * Implements the canonical client-side Soroban deposit workflow:
 * 1. Freighter wallet detection & connection
 * 2. Building the Soroban invocation transaction: `deposit(participant, league_id)`
 * 3. Simulating/preparing the transaction via Soroban RPC
 * 4. Requesting user signature via Freighter (`signTransaction`)
 * 5. Submitting the signed transaction to Stellar Testnet
 * 6. Polling for on-chain confirmation and returning the transaction hash
 */

import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  getNetworkDetails,
  signTransaction,
} from "@stellar/freighter-api";
import {
  Address,
  Contract,
  nativeToScVal,
  Networks,
  rpc,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export interface DepositParams {
  escrowContractId: string;
  leagueId: number | string;
  userPublicKey: string;
  rpcUrl?: string;
  networkPassphrase?: string;
  onProgress?: (status: string) => void;
}

export interface DepositResult {
  txHash: string;
  ledgerSeq?: number;
}

const DEFAULT_SOROBAN_RPC =
  process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL ||
  "https://soroban-testnet.stellar.org";
const DEFAULT_NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

/**
 * Checks if the Freighter browser extension is installed and available.
 */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const res = await isConnected();
    return Boolean(res && res.isConnected);
  } catch {
    return false;
  }
}

/**
 * Connects to Freighter, requests permission if necessary, and returns the active public key.
 */
export async function connectFreighter(): Promise<{
  publicKey: string;
  network: string;
}> {
  const installed = await isFreighterInstalled();
  if (!installed) {
    throw new Error(
      "Freighter wallet extension was not detected. Please install Freighter from https://www.freighter.app"
    );
  }

  const allowedRes = await isAllowed();
  if (!allowedRes || !allowedRes.isAllowed) {
    await setAllowed();
  }

  let publicKey = "";
  const accessRes = await requestAccess();
  if (accessRes && accessRes.address) {
    publicKey = accessRes.address;
  } else {
    const addrRes = await getAddress();
    if (addrRes && addrRes.address) {
      publicKey = addrRes.address;
    } else {
      throw new Error(
        accessRes?.error?.message ||
          addrRes?.error?.message ||
          "Could not retrieve public key from Freighter. Please unlock your wallet and try again."
      );
    }
  }

  const networkDetails = await getNetworkDetails();

  return {
    publicKey,
    network: networkDetails?.network || "TESTNET",
  };
}

/**
 * Builds, prepares, signs via Freighter, submits, and confirms a Soroban escrow deposit transaction.
 */
export async function depositToSorobanEscrow(
  params: DepositParams
): Promise<DepositResult> {
  const {
    escrowContractId,
    leagueId,
    userPublicKey,
    rpcUrl = DEFAULT_SOROBAN_RPC,
    networkPassphrase = DEFAULT_NETWORK_PASSPHRASE,
    onProgress,
  } = params;

  if (!escrowContractId) {
    throw new Error("Escrow contract ID is required for deposit.");
  }
  if (!userPublicKey) {
    throw new Error("User public key is required for deposit.");
  }

  onProgress?.("Connecting to Stellar network...");
  const server = new rpc.Server(rpcUrl, { allowHttp: false });

  // 1. Fetch user account sequence from RPC
  onProgress?.("Fetching account sequence...");
  let account;
  try {
    account = await server.getAccount(userPublicKey);
  } catch (err: any) {
    throw new Error(
      `Failed to load account ${userPublicKey}. Ensure your Testnet account is funded with XLM for gas fees.`
    );
  }

  // 2. Build the contract invocation operation
  onProgress?.("Building contract invocation...");
  const contract = new Contract(escrowContractId);

  // Convert numeric/string league ID to u64 ScVal
  const numericLeagueId =
    typeof leagueId === "string" ? parseInt(leagueId, 10) : leagueId;
  if (isNaN(numericLeagueId) || numericLeagueId < 0) {
    throw new Error(`Invalid league ID for escrow: ${leagueId}`);
  }

  const depositOp = contract.call(
    "deposit",
    new Address(userPublicKey).toScVal(),
    nativeToScVal(BigInt(numericLeagueId), { type: "u64" })
  );

  // 3. Build initial transaction
  const tx = new TransactionBuilder(account, {
    fee: "100000", // standard base fee (0.01 XLM max)
    networkPassphrase,
  })
    .addOperation(depositOp)
    .setTimeout(180)
    .build();

  // 4. Simulate and prepare transaction (fetches resource footprint, auth requirements, and Soroban fee)
  onProgress?.("Simulating transaction footprint...");
  let preparedTx;
  try {
    preparedTx = await server.prepareTransaction(tx);
  } catch (simErr: any) {
    const errMsg = simErr?.message || String(simErr);
    if (errMsg.includes("HostError") || errMsg.includes("Error(Contract")) {
      throw new Error(
        `Contract simulation rejected deposit. Ensure you have sufficient USDC balance and trustline. Details: ${errMsg}`
      );
    }
    throw new Error(`Transaction simulation failed: ${errMsg}`);
  }

  // 5. Request Freighter signature
  onProgress?.("Awaiting signature in Freighter...");
  let signedXdr: string;
  try {
    const signResult = await signTransaction(preparedTx.toXDR(), {
      networkPassphrase,
      address: userPublicKey,
    });

    if (signResult?.error) {
      throw new Error(
        signResult.error.message || String(signResult.error)
      );
    }

    signedXdr = signResult.signedTxXdr;
  } catch (signErr: any) {
    throw new Error(
      signErr?.message || "Signature request was rejected in Freighter."
    );
  }

  if (!signedXdr) {
    throw new Error("Freighter did not return a signed transaction.");
  }

  // 6. Submit transaction to Stellar network
  onProgress?.("Submitting transaction to Stellar Testnet...");
  const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const sendRes = await server.sendTransaction(signedTx);

  if (sendRes.status === "ERROR") {
    throw new Error(
      `Transaction submission error: ${JSON.stringify(sendRes.errorResult || sendRes)}`
    );
  }

  const txHash = sendRes.hash;

  // 7. Poll for confirmation
  onProgress?.("Confirming on Stellar ledger...");
  const maxAttempts = 24; // 24 * 2s = 48s max poll
  let attempts = 0;
  let confirmedLedgerSeq: number | undefined;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts++;

    try {
      const txStatus = await server.getTransaction(txHash);
      if (txStatus.status === "SUCCESS") {
        confirmedLedgerSeq = txStatus.latestLedger;
        break;
      } else if (txStatus.status === "FAILED") {
        throw new Error(
          `Transaction failed on ledger. Soroban execution reverted: ${txStatus.resultXdr || "Check contract preconditions"}`
        );
      }
      // status is NOT_FOUND (pending) - keep polling
    } catch (pollErr: any) {
      if (pollErr?.message?.includes("reverted") || pollErr?.message?.includes("failed on ledger")) {
        throw pollErr;
      }
      // Network hiccup during poll - continue
    }
  }

  onProgress?.("Transaction confirmed on-chain!");
  return {
    txHash,
    ledgerSeq: confirmedLedgerSeq,
  };
}
