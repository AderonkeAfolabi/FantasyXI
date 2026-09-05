/**
 * Stellar Testnet Deployer & Account Provisioning Script
 *
 * Automates:
 * 1. Generation of 4 ephemeral Testnet keypairs (Admin, Manager A, Manager B, Manager C).
 * 2. Account activation & funding via Stellar Testnet Friendbot (10,000 XLM each).
 * 3. Classic USDC asset creation & SAC (Soroban Asset Contract) deployment.
 * 4. Trustline establishment and test token minting (100 USDC to each manager).
 * 5. Deployment of the compiled fantasyxi_escrow.wasm contract to Testnet.
 * 6. Initialization of the escrow contract with admin and USDC token contract ID.
 * 7. Persistence of ephemeral test keys to .env.testnet.local (ignored by git).
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  Keypair,
  Asset,
  Networks,
  Horizon,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from "@stellar/stellar-sdk";

export interface TestnetDeploymentManifest {
  network: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  admin: {
    publicKey: string;
    secretKey: string;
  };
  managerA: {
    publicKey: string;
    secretKey: string;
  };
  managerB: {
    publicKey: string;
    secretKey: string;
  };
  managerC: {
    publicKey: string;
    secretKey: string;
  };
  usdcAssetCode: string;
  usdcIssuer: string;
  usdcTokenContractId: string;
  escrowContractId: string;
}

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
const STELLAR_CLI_PATH = path.resolve(
  process.cwd(),
  "..",
  "tools",
  "bin",
  "stellar.exe"
);
const WASM_PATH = path.resolve(
  process.cwd(),
  "..",
  "contracts",
  "target",
  "wasm32v1-none",
  "release",
  "fantasyxi_escrow.wasm"
);

export async function fundAccountWithFriendbot(publicKey: string): Promise<void> {
  console.log(`⏳ Requesting Friendbot funding for ${publicKey.slice(0, 8)}...`);
  const response = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Friendbot funding failed for ${publicKey}: ${errorText}`);
  }
  console.log(`✅ Friendbot funded 10,000 XLM to ${publicKey.slice(0, 8)}...`);
}

export async function deployTestnetEscrow(): Promise<TestnetDeploymentManifest> {
  console.log("============================================================");
  console.log("🚀 FANTASYXI STELLAR TESTNET DEPLOYMENT & PROVISIONING");
  console.log("============================================================");

  // 1. Check tools and WASM
  if (!fs.existsSync(STELLAR_CLI_PATH)) {
    throw new Error(`Stellar CLI not found at ${STELLAR_CLI_PATH}`);
  }
  if (!fs.existsSync(WASM_PATH)) {
    console.log("📦 Compiling contract with stellar contract build...");
    execSync(`"${STELLAR_CLI_PATH}" contract build`, {
      cwd: path.resolve(process.cwd(), "..", "contracts"),
      stdio: "inherit",
    });
  }

  const server = new Horizon.Server(HORIZON_URL);

  // 2. Generate keypairs
  console.log("\n🔑 Generating ephemeral Testnet keypairs...");
  const admin = Keypair.random();
  const managerA = Keypair.random();
  const managerB = Keypair.random();
  const managerC = Keypair.random();

  console.log(`• Admin:     ${admin.publicKey()}`);
  console.log(`• Manager A: ${managerA.publicKey()}`);
  console.log(`• Manager B: ${managerB.publicKey()}`);
  console.log(`• Manager C: ${managerC.publicKey()}`);

  // 3. Fund with Friendbot
  console.log("\n💰 Funding accounts via Friendbot faucet...");
  await fundAccountWithFriendbot(admin.publicKey());
  await fundAccountWithFriendbot(managerA.publicKey());
  await fundAccountWithFriendbot(managerB.publicKey());
  await fundAccountWithFriendbot(managerC.publicKey());

  // 4. Deploy SAC (Soroban Asset Contract) for test USDC
  console.log("\n🪙 Deploying Testnet USDC Asset Contract (SAC)...");
  const usdcAssetCode = "USDC";
  const usdcIssuer = admin.publicKey();
  const assetIdentifier = `${usdcAssetCode}:${usdcIssuer}`;

  const deployAssetCmd = `"${STELLAR_CLI_PATH}" contract asset deploy --asset "${assetIdentifier}" --source-account "${admin.secret()}" --network testnet`;
  const sacOutput = execSync(deployAssetCmd, { encoding: "utf-8" }).trim();
  const usdcTokenContractId = sacOutput.split(/\r?\n/).pop()!.trim();
  console.log(`✅ Testnet USDC SAC Contract ID: ${usdcTokenContractId}`);

  // 5. Establish trustlines and mint test tokens (100 USDC each)
  console.log("\n🤝 Establishing trustlines and minting 100 USDC to managers...");
  const usdcAsset = new Asset(usdcAssetCode, usdcIssuer);

  for (const manager of [managerA, managerB, managerC]) {
    const managerAccount = await server.loadAccount(manager.publicKey());
    const trustTx = new TransactionBuilder(managerAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.changeTrust({
          asset: usdcAsset,
          limit: "1000000",
        })
      )
      .setTimeout(30)
      .build();

    trustTx.sign(manager);
    await server.submitTransaction(trustTx);

    // Admin pays 100 USDC
    const adminAccount = await server.loadAccount(admin.publicKey());
    const payTx = new TransactionBuilder(adminAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: manager.publicKey(),
          asset: usdcAsset,
          amount: "100.0000000",
        })
      )
      .setTimeout(30)
      .build();

    payTx.sign(admin);
    await server.submitTransaction(payTx);
    console.log(`✅ Minted 100 USDC to ${manager.publicKey().slice(0, 8)}...`);
  }

  // 6. Deploy Escrow Contract WASM to Testnet
  console.log("\n📜 Deploying fantasyxi_escrow.wasm to Stellar Testnet...");
  const deployContractCmd = `"${STELLAR_CLI_PATH}" contract deploy --wasm "${WASM_PATH}" --source-account "${admin.secret()}" --network testnet`;
  const deployOutput = execSync(deployContractCmd, { encoding: "utf-8" }).trim();
  const escrowContractId = deployOutput.split(/\r?\n/).pop()!.trim();
  console.log(`✅ Escrow Contract Deployed! Contract ID: ${escrowContractId}`);

  // 7. Initialize Escrow Contract
  console.log("\n⚙️ Initializing escrow contract on-chain...");
  const initCmd = `"${STELLAR_CLI_PATH}" contract invoke --id "${escrowContractId}" --source-account "${admin.secret()}" --network testnet -- initialize --admin "${admin.publicKey()}" --usdc_token "${usdcTokenContractId}"`;
  execSync(initCmd, { stdio: "inherit" });
  console.log("✅ Escrow contract successfully initialized!");

  // 8. Persist to .env.testnet.local
  const envContent = [
    `# FantasyXI Stellar Testnet Ephemeral Deployment`,
    `STELLAR_NETWORK=TESTNET`,
    `STELLAR_HORIZON_URL=${HORIZON_URL}`,
    `STELLAR_SOROBAN_RPC_URL=${SOROBAN_RPC_URL}`,
    `STELLAR_USDC_ASSET_CODE=${usdcAssetCode}`,
    `STELLAR_USDC_ISSUER=${usdcIssuer}`,
    `STELLAR_USDC_TOKEN_CONTRACT_ID=${usdcTokenContractId}`,
    `STELLAR_ESCROW_CONTRACT_ID=${escrowContractId}`,
    `STELLAR_TREASURY_ADDRESS=${admin.publicKey()}`,
    `TESTNET_ADMIN_PUBLIC=${admin.publicKey()}`,
    `TESTNET_ADMIN_SECRET=${admin.secret()}`,
    `TESTNET_MANAGER_A_PUBLIC=${managerA.publicKey()}`,
    `TESTNET_MANAGER_A_SECRET=${managerA.secret()}`,
    `TESTNET_MANAGER_B_PUBLIC=${managerB.publicKey()}`,
    `TESTNET_MANAGER_B_SECRET=${managerB.secret()}`,
    `TESTNET_MANAGER_C_PUBLIC=${managerC.publicKey()}`,
    `TESTNET_MANAGER_C_SECRET=${managerC.secret()}`,
  ].join("\n");

  const envPath = path.resolve(process.cwd(), ".env.testnet.local");
  fs.writeFileSync(envPath, envContent, "utf-8");
  console.log(`\n💾 Saved deployment state to ${envPath}`);

  return {
    network: "TESTNET",
    horizonUrl: HORIZON_URL,
    sorobanRpcUrl: SOROBAN_RPC_URL,
    admin: { publicKey: admin.publicKey(), secretKey: admin.secret() },
    managerA: { publicKey: managerA.publicKey(), secretKey: managerA.secret() },
    managerB: { publicKey: managerB.publicKey(), secretKey: managerB.secret() },
    managerC: { publicKey: managerC.publicKey(), secretKey: managerC.secret() },
    usdcAssetCode,
    usdcIssuer,
    usdcTokenContractId,
    escrowContractId,
  };
}

// If executed directly from CLI:
if (process.argv[1]?.endsWith("testnetDeployer.ts")) {
  deployTestnetEscrow()
    .then((manifest) => {
      console.log("\n🎉 Deployment Complete!");
      console.log(`Contract ID: ${manifest.escrowContractId}`);
      console.log(`Token SAC:   ${manifest.usdcTokenContractId}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Deployment failed:", err);
      process.exit(1);
    });
}
