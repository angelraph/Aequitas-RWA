use odra::prelude::*;
use odra::types::{Address, U256};

#[odra::module]
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
    is_active: Var<bool>,
}

#[derive(odra::Event, Debug, PartialEq, Eq)]
pub struct Transfer {
    #[odra(index)]
    pub from: Option<Address>,
    #[odra(index)]
    pub to: Option<Address>,
    pub amount: U256,
}

#[derive(odra::Event, Debug, PartialEq, Eq)]
pub struct Approval {
    #[odra(index)]
    pub owner: Address,
    #[odra(index)]
    pub spender: Address,
    pub amount: U256,
}

#[derive(odra::Event, Debug, PartialEq, Eq)]
pub struct AssetUpdated {
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
        let from = self.env().caller();
        let from_balance = self.balances.get_or_default(&from);
        if from_balance < amount {
            self.env().revert(30001); // Custom error code for insufficient balance
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
        let owner = self.env().caller();
        self.allowances.set(&(owner, spender), amount);
        self.env().emit_event(Approval { owner, spender, amount });
    }

    pub fn transfer_from(&mut self, from: Address, to: Address, amount: U256) {
        let spender = self.env().caller();
        let allowance = self.allowances.get_or_default(&(from, spender));
        if allowance < amount {
            self.env().revert(30002); // Insufficient allowance
        }

        let from_balance = self.balances.get_or_default(&from);
        if from_balance < amount {
            self.env().revert(30001); // Insufficient balance
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

    // Agent Entrypoint: Risk pricing updates
    pub fn update_asset_data(&mut self, valuation: U256, risk_rating: String, yield_rate: u32) {
        let caller = self.env().caller();
        let issuer = self.issuer.get_or_default();
        
        // In prototype, only issuer (creator/agent) can update
        if caller != issuer {
            self.env().revert(30003); // Unauthorized
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

    pub fn get_metadata(&self) -> (String, String, U256, String, u32) {
        (
            self.name.get_or_default(),
            self.symbol.get_or_default(),
            self.valuation.get_or_default(),
            self.risk_rating.get_or_default(),
            self.yield_rate.get_or_default(),
        )
    }
}
