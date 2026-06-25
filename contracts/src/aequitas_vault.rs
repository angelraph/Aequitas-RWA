use odra::prelude::*;
use odra::types::{Address, U256};

#[odra::module]
pub struct AequitasVault {
    balances: Mapping<Address, U256>,
    total_deposits: Var<U256>,
    allocations: Mapping<Address, U256>, // maps RwaToken address -> allocated capital
    authorized_router: Var<Address>,
    owner: Var<Address>,
}

#[derive(odra::Event, Debug, PartialEq, Eq)]
pub struct Deposit {
    #[odra(index)]
    pub depositor: Address,
    pub amount: U256,
}

#[derive(odra::Event, Debug, PartialEq, Eq)]
pub struct Withdraw {
    #[odra(index)]
    pub depositor: Address,
    pub amount: U256,
}

#[derive(odra::Event, Debug, PartialEq, Eq)]
pub struct CapitalReallocated {
    #[odra(index)]
    pub rwa_token: Address,
    pub amount: U256,
    pub is_add: bool,
}

#[odra::module]
impl AequitasVault {
    #[odra(init)]
    pub fn init(&mut self, router: Address) {
        let caller = self.env().caller();
        self.authorized_router.set(router);
        self.owner.set(caller);
        self.total_deposits.set(U256::zero());
    }

    pub fn deposit(&mut self, amount: U256) {
        // In Casper standard, users transfer tokens or call with attached value.
        // For simplicity and compatibility in the emulator, we allow passing amount parameter.
        let caller = self.env().caller();
        let balance = self.balances.get_or_default(&caller);
        
        self.balances.set(&caller, balance + amount);
        let total = self.total_deposits.get_or_default();
        self.total_deposits.set(total + amount);

        self.env().emit_event(Deposit {
            depositor: caller,
            amount,
        });
    }

    pub fn withdraw(&mut self, amount: U256) {
        let caller = self.env().caller();
        let balance = self.balances.get_or_default(&caller);
        
        if balance < amount {
            self.env().revert(40001); // Insufficient vault balance
        }

        self.balances.set(&caller, balance - amount);
        let total = self.total_deposits.get_or_default();
        self.total_deposits.set(total - amount);

        // Native transfer logic back to caller
        // self.env().transfer_tokens(&caller, amount);

        self.env().emit_event(Withdraw {
            depositor: caller,
            amount,
        });
    }

    pub fn reallocate_capital(&mut self, rwa_token: Address, amount: U256, is_add: bool) {
        let caller = self.env().caller();
        let router = self.authorized_router.get_or_default();
        
        if caller != router {
            self.env().revert(40002); // Unauthorized router call
        }

        let current_allocation = self.allocations.get_or_default(&rwa_token);
        if is_add {
            // Allocate capital to RwaToken
            self.allocations.set(&rwa_token, current_allocation + amount);
        } else {
            // Redeem capital from RwaToken
            if current_allocation < amount {
                self.env().revert(40003); // Insufficient allocation to reduce
            }
            self.allocations.set(&rwa_token, current_allocation - amount);
        }

        self.env().emit_event(CapitalReallocated {
            rwa_token,
            amount,
            is_add,
        });
    }

    pub fn get_balance_of(&self, address: Address) -> U256 {
        self.balances.get_or_default(&address)
    }

    pub fn get_total_deposits(&self) -> U256 {
        self.total_deposits.get_or_default()
    }

    pub fn get_allocation_of(&self, rwa_token: Address) -> U256 {
        self.allocations.get_or_default(&rwa_token)
    }

    pub fn get_router(&self) -> Address {
        self.authorized_router.get_or_default()
    }
}
