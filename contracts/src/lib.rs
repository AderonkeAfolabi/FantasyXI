#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    LeagueAlreadyExists = 3,
    LeagueNotFound = 4,
    LeagueNotAcceptingDeposits = 5,
    AlreadyDeposited = 6,
    AlreadySettled = 7,
    InvalidAmount = 8,
    PayoutExceedsDeposits = 9,
    NotAuthorized = 10,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[contracttype]
#[repr(u32)]
pub enum LeagueStatus {
    Upcoming = 0,
    Active = 1,
    Settled = 2,
    Cancelled = 3,
}

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct LeagueState {
    pub creator: Address,
    pub entry_fee: i128,
    pub asset: Address,
    pub total_deposited: i128,
    pub participant_count: u32,
    pub status: LeagueStatus,
}

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub struct WinnerPayout {
    pub winner: Address,
    pub amount: i128,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    League(u64),
    Deposit(u64, Address),
}

#[contract]
pub struct FantasyXIEscrow;

#[contractimpl]
impl FantasyXIEscrow {
    /// Initializes the global escrow contract with an admin.
    pub fn initialize(env: Env, admin: Address) -> Result<(), EscrowError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(EscrowError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Registers a new competition partition identified by `league_id`.
    pub fn create_league(
        env: Env,
        creator: Address,
        league_id: u64,
        entry_fee: i128,
        asset: Address,
    ) -> Result<(), EscrowError> {
        creator.require_auth();

        if entry_fee < 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let key = DataKey::League(league_id);
        if env.storage().persistent().has(&key) {
            return Err(EscrowError::LeagueAlreadyExists);
        }

        // Validate that the token is a valid contract by executing a dummy read
        let _ = token::Client::new(&env, &asset).balance(&env.current_contract_address());

        let state = LeagueState {
            creator: creator.clone(),
            entry_fee,
            asset,
            total_deposited: 0,
            participant_count: 0,
            status: LeagueStatus::Upcoming,
        };

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (symbol_short!("created"), league_id),
            (creator, entry_fee),
        );

        Ok(())
    }

    /// Participant deposits their entry fee into the league escrow partition.
    pub fn deposit(env: Env, participant: Address, league_id: u64) -> Result<(), EscrowError> {
        participant.require_auth();

        let league_key = DataKey::League(league_id);
        let mut league: LeagueState = env
            .storage()
            .persistent()
            .get(&league_key)
            .ok_or(EscrowError::LeagueNotFound)?;

        if league.status != LeagueStatus::Upcoming {
            return Err(EscrowError::LeagueNotAcceptingDeposits);
        }

        let deposit_key = DataKey::Deposit(league_id, participant.clone());
        if env.storage().persistent().has(&deposit_key) {
            return Err(EscrowError::AlreadyDeposited);
        }

        // If entry fee > 0, transfer tokens into this contract
        if league.entry_fee > 0 {
            let token_client = token::Client::new(&env, &league.asset);
            token_client.transfer(
                &participant,
                &env.current_contract_address(),
                &league.entry_fee,
            );
        }

        env.storage()
            .persistent()
            .set(&deposit_key, &league.entry_fee);

        league.total_deposited += league.entry_fee;
        league.participant_count += 1;
        env.storage().persistent().set(&league_key, &league);

        env.events().publish(
            (symbol_short!("deposit"), league_id),
            (participant, league.entry_fee),
        );

        Ok(())
    }

    /// Admin settles the league, transferring platform fee and winner payouts.
    /// Strictly prevents double settlement by transitioning to Settled.
    pub fn settle(
        env: Env,
        admin: Address,
        league_id: u64,
        winners: Vec<WinnerPayout>,
        platform_treasury: Address,
        platform_fee: i128,
    ) -> Result<(), EscrowError> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotInitialized)?;

        if admin != stored_admin {
            return Err(EscrowError::NotAuthorized);
        }

        let league_key = DataKey::League(league_id);
        let mut league: LeagueState = env
            .storage()
            .persistent()
            .get(&league_key)
            .ok_or(EscrowError::LeagueNotFound)?;

        if league.status == LeagueStatus::Settled || league.status == LeagueStatus::Cancelled {
            return Err(EscrowError::AlreadySettled);
        }

        // Calculate total payout required
        let mut total_payout = platform_fee;
        for winner in winners.iter() {
            if winner.amount < 0 {
                return Err(EscrowError::InvalidAmount);
            }
            total_payout += winner.amount;
        }

        if total_payout > league.total_deposited {
            return Err(EscrowError::PayoutExceedsDeposits);
        }

        let token_client = token::Client::new(&env, &league.asset);

        // 1. Transfer platform fee
        if platform_fee > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &platform_treasury,
                &platform_fee,
            );
        }

        // 2. Transfer winner prizes
        for winner in winners.iter() {
            if winner.amount > 0 {
                token_client.transfer(
                    &env.current_contract_address(),
                    &winner.winner,
                    &winner.amount,
                );
            }
        }

        league.status = LeagueStatus::Settled;
        env.storage().persistent().set(&league_key, &league);

        env.events().publish(
            (symbol_short!("settle"), league_id),
            (total_payout, platform_fee),
        );

        Ok(())
    }

    /// Admin refunds deposits if a competition cannot proceed or is cancelled.
    pub fn refund(
        env: Env,
        admin: Address,
        league_id: u64,
        participants: Vec<Address>,
    ) -> Result<(), EscrowError> {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotInitialized)?;

        if admin != stored_admin {
            return Err(EscrowError::NotAuthorized);
        }

        let league_key = DataKey::League(league_id);
        let mut league: LeagueState = env
            .storage()
            .persistent()
            .get(&league_key)
            .ok_or(EscrowError::LeagueNotFound)?;

        if league.status == LeagueStatus::Settled {
            return Err(EscrowError::AlreadySettled);
        }

        let token_client = token::Client::new(&env, &league.asset);

        for participant in participants.iter() {
            let dep_key = DataKey::Deposit(league_id, participant.clone());
            if let Some(deposit_amount) = env.storage().persistent().get::<_, i128>(&dep_key) {
                if deposit_amount > 0 {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &participant,
                        &deposit_amount,
                    );
                }
                env.storage().persistent().remove(&dep_key);
            }
        }

        league.status = LeagueStatus::Cancelled;
        env.storage().persistent().set(&league_key, &league);

        env.events().publish(
            (symbol_short!("refund"), league_id),
            participants.len(),
        );

        Ok(())
    }

    /// Read queries
    pub fn get_league(env: Env, league_id: u64) -> Option<LeagueState> {
        env.storage().persistent().get(&DataKey::League(league_id))
    }

    pub fn get_deposit(env: Env, league_id: u64, participant: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Deposit(league_id, participant))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env};

    fn setup_test() -> (Env, Address, Address, FantasyXIEscrowClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin);
        let contract_id = env.register(FantasyXIEscrow, ());
        let client = FantasyXIEscrowClient::new(&env, &contract_id);

        client.initialize(&admin);

        (env, admin, token_contract.address(), client)
    }

    #[test]
    fn test_initialize_and_create_league() {
        let (env, _admin, token, client) = setup_test();
        let creator = Address::generate(&env);

        client.create_league(&creator, &101, &50_000_000, &token); // 5 USDC (with 7 decimals)

        let league = client.get_league(&101).expect("League should exist");
        assert_eq!(league.entry_fee, 50_000_000);
        assert_eq!(league.asset, token);
        assert_eq!(league.total_deposited, 0);
        assert_eq!(league.participant_count, 0);
        assert_eq!(league.status, LeagueStatus::Upcoming);
    }

    #[test]
    fn test_deposit_and_single_settlement() {
        let (env, admin, token_addr, client) = setup_test();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Mint USDC to participants
        token_admin_client.mint(&user1, &50_000_000);
        token_admin_client.mint(&user2, &50_000_000);

        // Create league
        client.create_league(&admin, &200, &50_000_000, &token_addr);

        // Deposits
        client.deposit(&user1, &200);
        client.deposit(&user2, &200);

        let league = client.get_league(&200).unwrap();
        assert_eq!(league.participant_count, 2);
        assert_eq!(league.total_deposited, 100_000_000); // 10 USDC

        // Settlement:
        // Platform fee: 5% of 10 USDC = 0.5 USDC = 5_000_000
        // Prize pool: 9.5 USDC = 95_000_000
        // 1st place: 70% of 9.5 USDC = 6.65 USDC = 66_500_000
        // 2nd place: 30% of 9.5 USDC = 2.85 USDC = 28_500_000
        let winners = vec![
            &env,
            WinnerPayout {
                winner: user1.clone(),
                amount: 66_500_000,
            },
            WinnerPayout {
                winner: user2.clone(),
                amount: 28_500_000,
            },
        ];

        client.settle(&admin, &200, &winners, &treasury, &5_000_000);

        let settled_league = client.get_league(&200).unwrap();
        assert_eq!(settled_league.status, LeagueStatus::Settled);

        // Verify balances
        let token_client = token::Client::new(&env, &token_addr);
        assert_eq!(token_client.balance(&user1), 66_500_000);
        assert_eq!(token_client.balance(&user2), 28_500_000);
        assert_eq!(token_client.balance(&treasury), 5_000_000);

        // Double settlement must fail
        let result = client.try_settle(&admin, &200, &winners, &treasury, &5_000_000);
        assert_eq!(result, Err(Ok(EscrowError::AlreadySettled)));
    }

    #[test]
    fn test_duplicate_deposit_rejected() {
        let (env, admin, token_addr, client) = setup_test();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let user1 = Address::generate(&env);
        token_admin_client.mint(&user1, &100_000_000);

        client.create_league(&admin, &201, &50_000_000, &token_addr);
        client.deposit(&user1, &201);

        // Second deposit must fail
        let result = client.try_deposit(&user1, &201);
        assert_eq!(result, Err(Ok(EscrowError::AlreadyDeposited)));
    }

    #[test]
    fn test_unauthorized_settlement_rejected() {
        let (env, admin, token_addr, client) = setup_test();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let user1 = Address::generate(&env);
        let attacker = Address::generate(&env);
        let treasury = Address::generate(&env);

        token_admin_client.mint(&user1, &50_000_000);
        client.create_league(&admin, &202, &50_000_000, &token_addr);
        client.deposit(&user1, &202);

        let winners = vec![
            &env,
            WinnerPayout {
                winner: attacker.clone(),
                amount: 47_500_000,
            },
        ];

        // Attacker attempts to settle
        let result = client.try_settle(&attacker, &202, &winners, &treasury, &2_500_000);
        assert_eq!(result, Err(Ok(EscrowError::NotAuthorized)));
    }

    #[test]
    fn test_settlement_payout_exceeding_deposits_rejected() {
        let (env, admin, token_addr, client) = setup_test();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let user1 = Address::generate(&env);
        let treasury = Address::generate(&env);

        token_admin_client.mint(&user1, &50_000_000);
        client.create_league(&admin, &203, &50_000_000, &token_addr);
        client.deposit(&user1, &203); // Total deposited = 50_000_000

        // Attempt payout of 100_000_000
        let winners = vec![
            &env,
            WinnerPayout {
                winner: user1.clone(),
                amount: 90_000_000,
            },
        ];

        let result = client.try_settle(&admin, &203, &winners, &treasury, &10_000_000);
        assert_eq!(result, Err(Ok(EscrowError::PayoutExceedsDeposits)));
    }

    #[test]
    fn test_refund_cancelled_league() {
        let (env, admin, token_addr, client) = setup_test();
        let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

        let user1 = Address::generate(&env);
        token_admin_client.mint(&user1, &50_000_000);

        client.create_league(&admin, &300, &50_000_000, &token_addr);
        client.deposit(&user1, &300);

        let token_client = token::Client::new(&env, &token_addr);
        assert_eq!(token_client.balance(&user1), 0);

        // Refund
        let participants = vec![&env, user1.clone()];
        client.refund(&admin, &300, &participants);

        assert_eq!(token_client.balance(&user1), 50_000_000);
        let league = client.get_league(&300).unwrap();
        assert_eq!(league.status, LeagueStatus::Cancelled);

        // Duplicate refund should do nothing (balance remains 50_000_000, no second payout)
        client.refund(&admin, &300, &participants);
        assert_eq!(token_client.balance(&user1), 50_000_000);

        // Settlement on a cancelled league must fail
        let winners = vec![
            &env,
            WinnerPayout {
                winner: user1.clone(),
                amount: 50_000_000,
            },
        ];
        let result = client.try_settle(&admin, &300, &winners, &admin, &0);
        assert_eq!(result, Err(Ok(EscrowError::AlreadySettled)));
    }

    #[test]
    fn test_multiple_assets_parallel_leagues() {
        let (env, admin, usdc_addr, client) = setup_test();
        let usdc_admin_client = token::StellarAssetClient::new(&env, &usdc_addr);
        let usdc_client = token::Client::new(&env, &usdc_addr);

        let xlm_admin = Address::generate(&env);
        let xlm_addr = env.register_stellar_asset_contract_v2(xlm_admin).address();
        let xlm_admin_client = token::StellarAssetClient::new(&env, &xlm_addr);
        let xlm_client = token::Client::new(&env, &xlm_addr);

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let treasury = Address::generate(&env);

        usdc_admin_client.mint(&user1, &100_000_000);
        xlm_admin_client.mint(&user2, &200_000_000);

        client.create_league(&admin, &400, &50_000_000, &usdc_addr);
        client.create_league(&admin, &401, &150_000_000, &xlm_addr);

        client.deposit(&user1, &400);
        client.deposit(&user2, &401);

        assert_eq!(usdc_client.balance(&user1), 50_000_000);
        assert_eq!(xlm_client.balance(&user2), 50_000_000);

        let usdc_winners = vec![
            &env,
            WinnerPayout {
                winner: user1.clone(),
                amount: 45_000_000,
            },
        ];
        client.settle(&admin, &400, &usdc_winners, &treasury, &5_000_000);

        let xlm_winners = vec![
            &env,
            WinnerPayout {
                winner: user2.clone(),
                amount: 140_000_000,
            },
        ];
        client.settle(&admin, &401, &xlm_winners, &treasury, &10_000_000);

        assert_eq!(usdc_client.balance(&user1), 95_000_000);
        assert_eq!(usdc_client.balance(&treasury), 5_000_000);
        assert_eq!(xlm_client.balance(&user2), 190_000_000);
        assert_eq!(xlm_client.balance(&treasury), 10_000_000);
    }

    #[test]
    fn test_zero_fee_league() {
        let (env, admin, token_addr, client) = setup_test();
        let creator = Address::generate(&env);
        let user = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.create_league(&creator, &500, &0, &token_addr);
        client.deposit(&user, &500);

        let league = client.get_league(&500).unwrap();
        assert_eq!(league.total_deposited, 0);

        let winners = vec![
            &env,
            WinnerPayout {
                winner: user.clone(),
                amount: 0,
            },
        ];
        client.settle(&admin, &500, &winners, &treasury, &0);
        let settled_league = client.get_league(&500).unwrap();
        assert_eq!(settled_league.status, LeagueStatus::Settled);
    }
}
