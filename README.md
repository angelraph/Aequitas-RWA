# Aequitas RWA

Aequitas RWA is a prototype platform showcasing **Agentic Yield Routing** and **Dynamic Risk Pricing** for tokenized Real-World Assets (RWAs) built on the Casper Network. 

The system implements a swarm agent architecture that automates risk evaluation and capital reallocation. Additionally, it highlights machine-to-machine micropayments using the **HTTP 402 Payment Required (x402)** protocol for accessing off-chain premium data feeds.

---

## 🌟 Key Features

1. **Casper Smart Contracts (Odra Framework)**
   * **`RwaToken`**: Represents tokenized assets (e.g., real estate, supply invoices) with dynamic on-chain properties (valuation, risk rating, and yield rate).
   * **`AequitasVault`**: A liquidity pool that collects user deposits and routes capital into high-yield RWA tokens based on instructions from the Treasury Router.

2. **Swarm Agent Architecture**
   * **Risk Evaluator Agent**: Periodically inspects off-chain market data. If access requires payment, it settles HTTP 402 payment requests programmatically, retrieves the metrics, and updates the smart contract states.
   * **Treasury Router Agent**: Utilizes a risk-reward optimization formula (incorporating yield rates and risk ratings) to compute optimal portfolio weights and trigger vault reallocations.

3. **HTTP 402 (x402) Micropayment Flow**
   * Demonstrates frictionless machine-to-machine Web3 payment routing. Agents sign and settle transactions instantly to purchase premium asset valuations from data oracle providers.

4. **Live Glassmorphic Dashboard**
   * Visualizes Casper Network ledger state, live transaction logs, and real-time portfolio allocations.
   * Includes interactive controls to manually trigger agents, trigger economic shocks (to test automatic agent rebalancing), and deposit or withdraw funds.

---

## 📁 Repository Structure

```
├── api/                   # Express backend simulating the Casper ledger & hosting agents
│   ├── agents/            # Treasury Router & Risk Evaluator agent scripts
│   ├── index.js           # Server routes, mock ledger state, and WebSocket handler
│   └── package.json       # Backend dependencies (cors, express, ws)
│
├── contracts/             # Casper Rust contracts using the Odra framework
│   ├── src/
│   │   ├── aequitas_vault.rs  # Vault contract handling deposits and reallocations
│   │   ├── rwa_token.rs       # Dynamic RWA token with metadata updating controls
│   │   └── lib.rs             # Crate entry point and unit tests
│   ├── Cargo.toml         # Rust package configuration
│   └── Odra.toml          # Odra compiler and contract manifest
│
├── frontend/              # Glassmorphic single-page web dashboard
│   ├── index.html         # HTML5 markup and layout
│   ├── style.css          # Vanilla CSS layout and premium neon animations
│   └── main.js            # Frontend logic and WebSocket event listeners
│
└── vercel.json            # Vercel serverless deployment config and routing rewrites
```

---

## 🚀 Getting Started

### 1. Smart Contract Development & Testing

Make sure you have [Rust](https://www.rust-lang.org/) installed.

```bash
# Navigate to the contracts directory
cd contracts

# Run unit tests to verify contract logic (RwaToken & AequitasVault interactions)
cargo test
```

### 2. Running the Emulator & Web Dashboard Locally

The backend Express server runs the network simulator and handles serving the frontend locally.

```bash
# Navigate to the API directory
cd api

# Install node dependencies
npm install

# Start the simulation server
npm start
```

Once running, navigate to **[http://localhost:4002](http://localhost:4002)** in your web browser. You should see the Aequitas RWA dashboard connect to the simulated ledger and begin processing blocks.

---

## ☁️ Deployment

The project is structured to deploy smoothly on **Vercel** serverless environments:
* `/api/*` requests route dynamically to `api/index.js` serverless handlers.
* Frontend assets are served statically under `/`.
* See [vercel.json](file:///c:/Users/Admin/Desktop/Aequitas%20RWA/vercel.json) for the rewrite rules.
