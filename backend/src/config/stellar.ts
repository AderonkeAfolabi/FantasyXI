/**
 * Stellar & Soroban Testnet Configuration
 *
 * Laravel analogy: Like config/services.php or config/stellar.php.
 * Centralizes all Stellar network parameters, RPC endpoints, asset definitions,
 * and contract IDs.
 *
 * Never hardcode private keys here! Only public network configuration.
 */

import { Horizon, rpc, Networks, Asset } from "@stellar/stellar-sdk";

export interface StellarConfig {
  network: "TESTNET" | "PUBLIC";
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  usdcAssetCode: string;
  usdcIssuer: string;
  treasuryAddress: string;
  escrowContractId: string;
}

export const stellarConfig: StellarConfig = {
  network: (process.env.STELLAR_NETWORK as "TESTNET" | "PUBLIC") || "TESTNET",
  horizonUrl:
    process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org",
  sorobanRpcUrl:
    process.env.STELLAR_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
  networkPassphrase:
    process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET,
  usdcAssetCode: process.env.STELLAR_USDC_ASSET_CODE || "USDC",
  // Standard Testnet USDC issuer (or platform test asset issuer)
  usdcIssuer:
    process.env.STELLAR_USDC_ISSUER ||
    "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWUIPWIO2LEOWOHR67K",
  treasuryAddress:
    process.env.STELLAR_TREASURY_ADDRESS ||
    "GDWZ67PEXB3P4XJ5A6M6Q7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H2I3J4",
  escrowContractId:
    process.env.STELLAR_ESCROW_CONTRACT_ID ||
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

/**
 * Lazy-initialized Horizon Server client.
 */
let _horizonServer: Horizon.Server | null = null;
export function getHorizonServer(): Horizon.Server {
  if (!_horizonServer) {
    _horizonServer = new Horizon.Server(stellarConfig.horizonUrl);
  }
  return _horizonServer;
}

/**
 * Lazy-initialized Soroban RPC Server client.
 */
let _sorobanRpcServer: rpc.Server | null = null;
export function getSorobanRpcServer(): rpc.Server {
  if (!_sorobanRpcServer) {
    _sorobanRpcServer = new rpc.Server(stellarConfig.sorobanRpcUrl);
  }
  return _sorobanRpcServer;
}

/**
 * Returns the Stellar Asset instance for USDC.
 */
export function getUsdcAsset(): Asset {
  return new Asset(stellarConfig.usdcAssetCode, stellarConfig.usdcIssuer);
}
