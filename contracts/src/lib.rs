pub mod rwa_token;
pub mod aequitas_vault;

pub use rwa_token::{RwaToken, Transfer, Approval, AssetUpdated};
pub use aequitas_vault::{AequitasVault, Deposit, Withdraw, CapitalReallocated};

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};
    use odra::casper_types::U256;

    #[test]
    fn test_rwa_token_and_vault() {
        let env = odra_test::env();

        // 1. Deploy RwaToken
        let token_args = rwa_token::RwaTokenInitArgs {
            name: "Greenwood Office Park".to_string(),
            symbol: "RWA-REAL-101".to_string(),
            initial_supply: U256::from(100_000),
            valuation: U256::from(1_200_000),
            risk_rating: "A".to_string(),
            yield_rate: 720,
        };
        let mut token = rwa_token::RwaTokenHostRef::deploy(&env, token_args);

        assert_eq!(token.name(), "Greenwood Office Park");
        assert_eq!(token.symbol(), "RWA-REAL-101");
        assert_eq!(token.balance_of(env.get_account(0)), U256::from(100_000));

        // 2. Deploy AequitasVault
        let router_address = env.get_account(1);
        let vault_args = aequitas_vault::AequitasVaultInitArgs {
            router: router_address,
        };
        let mut vault = aequitas_vault::AequitasVaultHostRef::deploy(&env, vault_args);

        assert_eq!(vault.get_router(), router_address);
        assert_eq!(vault.get_total_deposits(), U256::zero());

        // Test deposit
        env.set_caller(env.get_account(0));
        vault.deposit(U256::from(50_000));
        assert_eq!(vault.get_balance_of(env.get_account(0)), U256::from(50_000));
        assert_eq!(vault.get_total_deposits(), U256::from(50_000));

        // Test reallocation (from router account 1)
        env.set_caller(router_address);
        vault.reallocate_capital(token.address(), U256::from(20_000), true);
        assert_eq!(vault.get_allocation_of(token.address()), U256::from(20_000));

        // Test metadata updates on RWA token (from issuer account 0)
        env.set_caller(env.get_account(0));
        token.update_asset_data(U256::from(1_300_000), "A+".to_string(), 700);
        let metadata = token.get_metadata();
        assert_eq!(metadata.valuation, U256::from(1_300_000));
        assert_eq!(metadata.risk_rating, "A+");
        assert_eq!(metadata.yield_rate, 700);
    }
}
