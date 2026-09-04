# FantasyXI — Regulatory, Legal & Compliance Considerations

## Executive Summary

FantasyXI combines Premier League / Fantasy Premier League (FPL) performance data with blockchain-based financial settlements powered by the Stellar network and USDC stablecoins. 

Operating competitions that pool real or tokenized funds (such as USDC entry fees) and distribute financial prizes requires rigorous adherence to international and regional regulatory frameworks. This document outlines the legal considerations, regulatory classifications, Nigerian jurisdictional implications, risk mitigations, and non-negotiable launch blockers.

---

## 1. Skill-Based Gaming vs. Gambling Classification

### Game of Skill vs. Game of Chance
A central legal distinction across global jurisdictions is whether a fantasy competition constitutes a **Game of Skill** or a **Game of Chance (Gambling/Betting)**.

1. **Game of Skill**:
   - The outcome is determined predominantly by the manager's knowledge, statistical analysis, tactical foresight, team composition within budget constraints, and active squad management over multiple gameweeks.
   - FantasyXI enforces deterministic FPL rules: 15-player squad, £100.0m budget cap, maximum 3 players per Premier League club, starting XI vs. bench ordering, captaincy multipliers, and auto-substitutions.
   - The platform fee (5%) and prize distribution (60% / 30% / 10%) are predetermined before competition start and do not fluctuate based on odds or bookmaker spreads.

2. **Game of Chance**:
   - In pure sports betting or casino games, the house wagers against the user, sets fluctuating odds, or relies on randomized outcomes (e.g., roulette, slot machines).
   - In FantasyXI, the platform is **never a counterparty**. FantasyXI provides the deterministic peer-to-peer competition and escrow protocol; users compete exclusively against other managers.

### United States: UIGEA Safe Harbor (31 U.S.C. § 5362)
In the United States, the Unlawful Internet Gambling Enforcement Act of 2006 (UIGEA) explicitly exempts fantasy sports from unlawful gambling provisions if the competition satisfies three criteria:
1. All winning outcomes reflect the relative knowledge and skill of participants.
2. All prizes and awards are established and made known to participants in advance of the contest and do not depend on the number of participants or the amount of fees collected after competition commences.
3. The outcome is not based on the score, point spread, or any performance of any single real-world team or combination of such teams, or solely on any single performance of an individual athlete in any single real-world sporting event.

> **Status in FantasyXI**: FantasyXI meets all three conditions. Competitions span entire Premier League gameweeks, prize distributions are deterministically locked, and scores aggregate performances of 11 distinct starting athletes across multiple Premier League clubs.

---

## 2. Nigerian Jurisdiction (NLRC & SEC Nigeria)

As an Africa-focused and global platform, Nigerian statutory requirements are paramount.

### A. National Lottery Regulatory Commission (NLRC)
* **Governing Statute**: National Lottery Act 2005.
* **Scope**: Regulates lotteries, sports betting, promotional competitions, and gaming operations in Nigeria.
* **Fantasy Sports Classification**: While traditional sports betting is licensed under Sports Betting Permits, peer-to-peer skill-based fantasy competitions with prize pools often fall under promotional gaming or skill contest guidelines unless categorized as sports betting by administrative fiat.
* **Requirement**: FantasyXI must obtain formal regulatory clearance or an operating permit from the NLRC before onboarding Nigerian residents for paid entry leagues.

### B. Securities and Exchange Commission (SEC Nigeria)
* **Governing Statute**: Investments and Securities Act (ISA) & SEC New Rules on Digital Assets (2022).
* **Scope**: Regulates Virtual Asset Service Providers (VASPs), digital token offerings, and crypto platforms operating within Nigeria or targeting Nigerian residents.
* **Token Classification**:
  * FantasyXI utilizes **Circle USDC**, a fully collateralized fiat-backed stablecoin issued by a regulated entity. FantasyXI does not issue its own native utility token or speculative speculative token.
  * However, providing escrow contracts and automated payouts can trigger VASP registration requirements if the platform is deemed to be facilitating exchange, transfer, or administration of digital assets.
* **Mitigation**: FantasyXI implements a **non-custodial architecture**. User wallets interact directly with the open-source Soroban smart contract; FantasyXI servers never hold custody of participant private keys or custodial fund pools.

---

## 3. Geofencing & Prohibited Jurisdictions

FantasyXI includes a `countryCode` field on the `User` model to enforce programmatic geofencing.

### Prohibited / Restricted Jurisdictions:
1. **Sanctioned Nations (OFAC & FATF Blacklist)**:
   - North Korea (DPRK), Iran, Syria, Cuba, Crimea/Donetsk/Luhansk regions.
   - Absolute ban on user registration, deposit, and settlement.
2. **Restricted US States**:
   - Certain US states (e.g., Washington, Idaho, Montana, Nevada, Louisiana) prohibit or strictly license paid fantasy sports competitions.
   - Free leagues (`entryFee === 0`) remain accessible globally, while paid escrow leagues must be geofenced based on verified location.
3. **Jurisdictions Prohibiting Crypto Stablecoins**:
   - Jurisdictions where stablecoin usage or non-custodial transactions are banned or heavily restricted.

---

## 4. Architectural Boundaries: Custodial vs. Non-Custodial

To minimize regulatory exposure as a money transmitter or custodian:

```text
┌────────────────────────────────────────────────────────┐
│               FantasyXI Application Layer              │
│  - User Accounts (Email/Password & Google OAuth)       │
│  - FPL Data Sync & Squad Validation                    │
│  - Gameweek Scoring & League Standings                 │
│  - Payment Verification & Ledger Audit                 │
└──────────────────────────┬─────────────────────────────┘
                           │ Pure Data / Non-Custodial
                           ▼
┌────────────────────────────────────────────────────────┐
│               Stellar / Soroban Ledger                 │
│  - User signs transactions via Freighter / Wallet      │
│  - Soroban Escrow Contract locks USDC tokens           │
│  - Zero private keys stored on FantasyXI servers       │
│  - Settlement executed atomically on-chain             │
└────────────────────────────────────────────────────────┘
```

1. **No Custody of Funds**: FantasyXI never acts as a bank or custodial exchange.
2. **No Private Key Storage**: The database only stores public Stellar addresses (`G...`) and transaction hashes.
3. **Deterministic Math**: Integer cents arithmetic prevents rounding errors or lost funds.

---

## 5. Launch Blockers Prior to Production Mainnet

Before deploying paid leagues to Stellar Mainnet and accepting real USDC:

1. [ ] **Legal Opinion Letter**: Formal legal opinion from gaming and financial regulatory counsel in target jurisdictions (Nigeria, UK, US).
2. [ ] **NLRC / Gaming License**: Appropriate licensing or promotional gaming permit obtained where required.
3. [ ] **Identity Verification (KYC / AML)**: Integration of a compliance provider (e.g., Sumsub, Smile Identity) to verify participant age (18+), residency, and sanctions screening for paid competitions above statutory thresholds.
4. [ ] **Smart Contract Security Audit**: Independent cryptographic audit of the Soroban escrow smart contract code.
5. [ ] **Responsible Gaming Controls**:
   - Self-exclusion options.
   - Deposit and entry fee limits per user per week/month.
   - Clear terms of service and risk disclosures regarding stablecoin volatility and regulatory uncertainty.
