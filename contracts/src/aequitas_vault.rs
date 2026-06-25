use odra::prelude::*;
use odra::casper_types::U256;

#[odra::module(events = [Deposit, Withdraw, CapitalReallocated])]
pub struct AequitasVault {
    balances: Mapping<Address, U256>,
    total_deposits: Var<U256>,
    allocations: Mapping<Address, U256>, // maps RwaToken address -> allocated capital
    authorized_router: Var<Address>,
    owner: Var<Address>,
}

#[odra::event]
pub struct Deposit {
    pub depositor: Address,
    pub amount: U256,
}

#[odra::event]
pub struct Withdraw {
    pub depositor: Address,
    pub amount: U256,
}

#[odra::event]
pub struct CapitalReallocated {
    pub rwa_token: Address,
    pub amount: U256,
    pub is_add: bool,
}

#[odra::odra_error]
pub enum Error {
    InsufficientVaultBalance = 40001,
    UnauthorizedRouter = 40002,
    InsufficientAllocation = 40003,
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
            self.env().revert(Error::InsufficientVaultBalance);
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
        let router = self.authorized_router.get().unwrap();
        
        if caller != router {
            self.env().revert(Error::UnauthorizedRouter);
        }

        let current_allocation = self.allocations.get_or_default(&rwa_token);
        if is_add {
            // Allocate capital to RwaToken
            self.allocations.set(&rwa_token, current_allocation + amount);
        } else {
            // Redeem capital from RwaToken
            if current_allocation < amount {
                self.env().revert(Error::InsufficientAllocation);
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
        self.authorized_router.get().unwrap()
    }
}
