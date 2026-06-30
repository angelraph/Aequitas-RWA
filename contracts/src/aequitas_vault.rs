use odra::prelude::*;
use odra::casper_types::U256;

#[odra::module(events = [Deposit, Withdraw, CapitalReallocated, PausedStateChanged, ComplianceProofRegistered])]
pub struct AequitasVault {
    balances: Mapping<Address, U256>,
    total_deposits: Var<U256>,
    allocations: Mapping<Address, U256>, // maps RwaToken address -> allocated capital
    compliance_proofs: Mapping<Address, U256>, // maps investor address -> compliance proof hash
    authorized_router: Var<Address>,
    compliance_officer: Var<Address>,
    owner: Var<Address>,
    is_paused: Var<bool>,
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

#[odra::event]
pub struct PausedStateChanged {
    pub paused: bool,
}

#[odra::event]
pub struct ComplianceProofRegistered {
    pub investor: Address,
    pub proof_hash: U256,
}

#[odra::odra_error]
pub enum Error {
    InsufficientVaultBalance = 40001,
    UnauthorizedRouter = 40002,
    InsufficientAllocation = 40003,
    Unauthorized = 40004,
    ContractPaused = 40005,
    NonCompliantInvestor = 40006,
}

#[odra::module]
impl AequitasVault {
    #[odra(init)]
    pub fn init(&mut self, router: Address) {
        let caller = self.env().caller();
        self.authorized_router.set(router);
        self.compliance_officer.set(caller);
        self.owner.set(caller);
        self.total_deposits.set(U256::zero());
        self.is_paused.set(false);
    }

    pub fn deposit(&mut self, amount: U256) {
        if self.is_paused.get_or_default() {
            self.env().revert(Error::ContractPaused);
        }
        let caller = self.env().caller();
        
        // Compliance check
        let proof = self.compliance_proofs.get_or_default(&caller);
        if proof == U256::zero() {
            self.env().revert(Error::NonCompliantInvestor);
        }

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
        if self.is_paused.get_or_default() {
            self.env().revert(Error::ContractPaused);
        }
        let caller = self.env().caller();
        
        // Compliance check
        let proof = self.compliance_proofs.get_or_default(&caller);
        if proof == U256::zero() {
            self.env().revert(Error::NonCompliantInvestor);
        }

        let balance = self.balances.get_or_default(&caller);
        
        if balance < amount {
            self.env().revert(Error::InsufficientVaultBalance);
        }

        self.balances.set(&caller, balance - amount);
        let total = self.total_deposits.get_or_default();
        self.total_deposits.set(total - amount);

        self.env().emit_event(Withdraw {
            depositor: caller,
            amount,
        });
    }

    pub fn reallocate_capital(&mut self, rwa_token: Address, amount: U256, is_add: bool) {
        if self.is_paused.get_or_default() {
            self.env().revert(Error::ContractPaused);
        }
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

    // Role management
    pub fn set_router(&mut self, router: Address) {
        let caller = self.env().caller();
        if caller != self.owner.get().unwrap() {
            self.env().revert(Error::Unauthorized);
        }
        self.authorized_router.set(router);
    }

    pub fn set_compliance_officer(&mut self, officer: Address) {
        let caller = self.env().caller();
        if caller != self.owner.get().unwrap() {
            self.env().revert(Error::Unauthorized);
        }
        self.compliance_officer.set(officer);
    }

    pub fn set_paused(&mut self, paused: bool) {
        let caller = self.env().caller();
        if caller != self.owner.get().unwrap() {
            self.env().revert(Error::Unauthorized);
        }
        self.is_paused.set(paused);
        self.env().emit_event(PausedStateChanged { paused });
    }

    // ZK compliance registration
    pub fn register_compliance_proof(&mut self, investor: Address, proof_hash: U256) {
        let caller = self.env().caller();
        let compliance_officer = self.compliance_officer.get().unwrap();
        let owner = self.owner.get().unwrap();

        if caller != compliance_officer && caller != owner {
            self.env().revert(Error::Unauthorized);
        }

        self.compliance_proofs.set(&investor, proof_hash);
        self.env().emit_event(ComplianceProofRegistered {
            investor,
            proof_hash,
        });
    }

    pub fn is_compliant(&self, investor: Address) -> bool {
        self.compliance_proofs.get_or_default(&investor) != U256::zero()
    }

    pub fn get_compliance_proof_of(&self, investor: Address) -> U256 {
        self.compliance_proofs.get_or_default(&investor)
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

    pub fn get_compliance_officer(&self) -> Address {
        self.compliance_officer.get().unwrap()
    }

    pub fn is_paused(&self) -> bool {
        self.is_paused.get_or_default()
    }
}
