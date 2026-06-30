use odra::prelude::*;
use odra::casper_types::U256;

#[odra::module(events = [Transfer, Approval, AssetUpdated, PausedStateChanged])]
pub struct RwaToken {
    name: Var<String>,
    symbol: Var<String>,
    decimals: Var<u8>,
    total_supply: Var<U256>,
    balances: Mapping<Address, U256>,
    allowances: Mapping<(Address, Address), U256>,
    
    // RWA Metadata
    valuation: Var<U256>,      // Valuation in micro-USD (e.g. cents or decimals)
    risk_rating: Var<String>,   // e.g. "A+", "B-", "C"
    yield_rate: Var<u32>,       // Yield rate in basis points (e.g. 850 = 8.5%)
    issuer: Var<Address>,
    owner: Var<Address>,
    oracle: Var<Address>,
    is_paused: Var<bool>,
    is_active: Var<bool>,
}

#[odra::event]
pub struct Transfer {
    pub from: Option<Address>,
    pub to: Option<Address>,
    pub amount: U256,
}

#[odra::event]
pub struct Approval {
    pub owner: Address,
    pub spender: Address,
    pub amount: U256,
}

#[odra::event]
pub struct AssetUpdated {
    pub valuation: U256,
    pub risk_rating: String,
    pub yield_rate: u32,
}

#[odra::event]
pub struct PausedStateChanged {
    pub paused: bool,
}

#[odra::odra_error]
pub enum Error {
    InsufficientBalance = 30001,
    InsufficientAllowance = 30002,
    Unauthorized = 30003,
    ContractPaused = 30004,
}

#[odra::odra_type]
pub struct RwaMetadata {
    pub name: String,
    pub symbol: String,
    pub valuation: U256,
    pub risk_rating: String,
    pub yield_rate: u32,
}

#[odra::module]
impl RwaToken {
    #[odra(init)]
    pub fn init(
        &mut self,
        name: String,
        symbol: String,
        initial_supply: U256,
        valuation: U256,
        risk_rating: String,
        yield_rate: u32,
    ) {
        let caller = self.env().caller();
        self.name.set(name);
        self.symbol.set(symbol);
        self.decimals.set(9); // standard Casper decimals
        self.total_supply.set(initial_supply);
        self.balances.set(&caller, initial_supply);
        
        self.valuation.set(valuation);
        self.risk_rating.set(risk_rating);
        self.yield_rate.set(yield_rate);
        self.issuer.set(caller);
        self.owner.set(caller);
        self.oracle.set(caller);
        self.is_paused.set(false);
        self.is_active.set(true);

        self.env().emit_event(Transfer {
            from: None,
            to: Some(caller),
            amount: initial_supply,
        });
    }

    pub fn name(&self) -> String {
        self.name.get_or_default()
    }

    pub fn symbol(&self) -> String {
        self.symbol.get_or_default()
    }

    pub fn decimals(&self) -> u8 {
        self.decimals.get_or_default()
    }

    pub fn total_supply(&self) -> U256 {
        self.total_supply.get_or_default()
    }

    pub fn balance_of(&self, address: Address) -> U256 {
        self.balances.get_or_default(&address)
    }

    pub fn allowance(&self, owner: Address, spender: Address) -> U256 {
        self.allowances.get_or_default(&(owner, spender))
    }

    pub fn transfer(&mut self, to: Address, amount: U256) {
        if self.is_paused.get_or_default() {
            self.env().revert(Error::ContractPaused);
        }
        let from = self.env().caller();
        let from_balance = self.balances.get_or_default(&from);
        if from_balance < amount {
            self.env().revert(Error::InsufficientBalance);
        }
        
        self.balances.set(&from, from_balance - amount);
        let to_balance = self.balances.get_or_default(&to);
        self.balances.set(&to, to_balance + amount);

        self.env().emit_event(Transfer {
            from: Some(from),
            to: Some(to),
            amount,
        });
    }

    pub fn approve(&mut self, spender: Address, amount: U256) {
        if self.is_paused.get_or_default() {
            self.env().revert(Error::ContractPaused);
        }
        let owner = self.env().caller();
        self.allowances.set(&(owner, spender), amount);
        self.env().emit_event(Approval { owner, spender, amount });
    }

    pub fn transfer_from(&mut self, from: Address, to: Address, amount: U256) {
        if self.is_paused.get_or_default() {
            self.env().revert(Error::ContractPaused);
        }
        let spender = self.env().caller();
        let allowance = self.allowances.get_or_default(&(from, spender));
        if allowance < amount {
            self.env().revert(Error::InsufficientAllowance);
        }

        let from_balance = self.balances.get_or_default(&from);
        if from_balance < amount {
            self.env().revert(Error::InsufficientBalance);
        }

        self.allowances.set(&(from, spender), allowance - amount);
        self.balances.set(&from, from_balance - amount);
        let to_balance = self.balances.get_or_default(&to);
        self.balances.set(&to, to_balance + amount);

        self.env().emit_event(Transfer {
            from: Some(from),
            to: Some(to),
            amount,
        });
    }

    // Role configuration
    pub fn set_oracle(&mut self, oracle: Address) {
        let caller = self.env().caller();
        if caller != self.owner.get().unwrap() {
            self.env().revert(Error::Unauthorized);
        }
        self.oracle.set(oracle);
    }

    pub fn set_issuer(&mut self, issuer: Address) {
        let caller = self.env().caller();
        if caller != self.owner.get().unwrap() {
            self.env().revert(Error::Unauthorized);
        }
        self.issuer.set(issuer);
    }

    pub fn set_paused(&mut self, paused: bool) {
        let caller = self.env().caller();
        if caller != self.owner.get().unwrap() {
            self.env().revert(Error::Unauthorized);
        }
        self.is_paused.set(paused);
        self.env().emit_event(PausedStateChanged { paused });
    }

    pub fn get_owner(&self) -> Address {
        self.owner.get().unwrap()
    }

    pub fn get_oracle(&self) -> Address {
        self.oracle.get().unwrap()
    }

    pub fn get_issuer(&self) -> Address {
        self.issuer.get().unwrap()
    }

    pub fn is_paused(&self) -> bool {
        self.is_paused.get_or_default()
    }

    // Agent Entrypoint: Risk pricing updates
    pub fn update_asset_data(&mut self, valuation: U256, risk_rating: String, yield_rate: u32) {
        if self.is_paused.get_or_default() {
            self.env().revert(Error::ContractPaused);
        }
        let caller = self.env().caller();
        let issuer = self.issuer.get().unwrap();
        let oracle = self.oracle.get().unwrap();
        let owner = self.owner.get().unwrap();
        
        if caller != issuer && caller != oracle && caller != owner {
            self.env().revert(Error::Unauthorized);
        }

        self.valuation.set(valuation);
        self.risk_rating.set(risk_rating.clone());
        self.yield_rate.set(yield_rate);

        self.env().emit_event(AssetUpdated {
            valuation,
            risk_rating,
            yield_rate,
        });
    }

    pub fn get_metadata(&self) -> RwaMetadata {
        RwaMetadata {
            name: self.name.get_or_default(),
            symbol: self.symbol.get_or_default(),
            valuation: self.valuation.get_or_default(),
            risk_rating: self.risk_rating.get_or_default(),
            yield_rate: self.yield_rate.get_or_default(),
        }
    }
}
