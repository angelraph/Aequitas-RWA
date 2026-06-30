import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import { startRiskEvaluator } from './agents/risk_evaluator.js';
import { startTreasuryRouter } from './agents/treasury_router.js';
import { calculateRiskMetrics } from './agents/risk_engine.js';
import { runOrchestration } from './agents/multi_agent_system.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Server-wide log stream
const logs = [];
function addLog(agent, message, type = 'info') {
  const logEntry = {
    timestamp: new Date().toLocaleTimeString(),
    agent,     // 'Risk Evaluator', 'Treasury Router', 'x402 Facilitator', 'Casper Network', 'System'
    message,
    type       // 'info', 'success', 'warning', 'error', 'transaction', 'payment'
  };
  logs.push(logEntry);
  if (logs.length > 500) logs.shift();
  
  // Broadcast to all WS clients
  const messageStr = JSON.stringify({ type: 'LOG', data: logEntry });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(messageStr);
    }
  });
  console.log(`[${logEntry.agent}] (${type}) ${message}`);
}

// ----------------------------------------------------
// Mock Casper Blockchain State
// ----------------------------------------------------
const LEDGER = {
  accounts: {
    'user_wallet': { balance: '500000.00' },
    'risk_evaluator_wallet': { balance: '500.00' },
    'treasury_router_wallet': { balance: '100.00' },
    'cspr_premium_api_vault': { balance: '10.00' },
    'aequitas_vault_contract': { balance: '150000.00' }, // Total deposited TVL
  },
  compliance: {
    'user_wallet': { status: 'VERIFIED', proofHash: '0x3F8E92B1C789F' }
  },
  contracts: {
    'AequitasVault': {
      router: 'treasury_router_wallet',
      totalDeposits: '150000.00',
      balances: {
        'user_wallet': '150000.00'
      },
      allocations: {
        'RWA-REAL-101': '70000.00',  // Greenwood Office Park
        'RWA-INV-202': '50000.00',   // Global Supply Invoices
        'RWA-SHIP-303': '30000.00',  // Maritime Freight Receivables
      }
    },
    'RWA-REAL-101': {
      name: "Greenwood Office Park",
      symbol: "RWA-REAL-101",
      decimals: 9,
      totalSupply: "100000.00",
      valuation: "1200000",      // USD
      riskRating: "A",
      yieldRate: 720,            // 7.20% (basis points)
      issuer: "risk_evaluator_wallet",
      isActive: true
    },
    'RWA-INV-202': {
      name: "Global Supply Invoices",
      symbol: "RWA-INV-202",
      decimals: 9,
      totalSupply: "100000.00",
      valuation: "450000",
      riskRating: "B+",
      yieldRate: 850,            // 8.50%
      issuer: "risk_evaluator_wallet",
      isActive: true
    },
    'RWA-SHIP-303': {
      name: "Maritime Freight Receivables",
      symbol: "RWA-SHIP-303",
      decimals: 9,
      totalSupply: "100000.00",
      valuation: "850000",
      riskRating: "B-",
      yieldRate: 980,            // 9.80%
      issuer: "risk_evaluator_wallet",
      isActive: true
    }
  },
  transactions: [
    { id: "tx_001", type: "DEPLOY", sender: "user_wallet", time: "18:00:00", description: "Deploy AequitasVault.wasm" },
    { id: "tx_002", type: "DEPLOY", sender: "risk_evaluator_wallet", time: "18:01:00", description: "Deploy RWA-REAL-101.wasm" },
    { id: "tx_003", type: "DEPLOY", sender: "risk_evaluator_wallet", time: "18:01:30", description: "Deploy RWA-INV-202.wasm" },
    { id: "tx_004", type: "DEPLOY", sender: "risk_evaluator_wallet", time: "18:02:00", description: "Deploy RWA-SHIP-303.wasm" },
    { id: "tx_005", type: "CALL", sender: "user_wallet", time: "18:05:00", description: "Deposit 150,000 CSPR to AequitasVault" },
  ]
};

// ----------------------------------------------------
// Premium Off-Chain Asset Data & Economic Shocks Mock
// ----------------------------------------------------
const OFF_CHAIN_PREMIUM_SOURCE = {
  'RWA-REAL-101': { valuation: 1200000, riskRating: "A", yieldRate: 720 },
  'RWA-INV-202': { valuation: 450000, riskRating: "B+", yieldRate: 850 },
  'RWA-SHIP-303': { valuation: 850000, riskRating: "B-", yieldRate: 980 },
};

// Pending pay references for x402 validation
const pendingPayments = new Map();

// ----------------------------------------------------
// HTTP Endpoints
// ----------------------------------------------------

let agentAutomation = true;
const agentState = {
  getAutomation: () => agentAutomation,
  triggerEvaluator: null,
  triggerRouter: null
};

let lastSimulationTick = 0;
const SIMULATION_TICK_INTERVAL = 12000;

// Middleware to advance simulation on Vercel Serverless environment
app.use(async (req, res, next) => {
  if (process.env.VERCEL) {
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const currentBaseUrl = `${protocol}://${host}`;

    if (!agentState.initialized) {
      addLog('System', 'Aequitas RWA blockchain network simulator serverless init.', 'info');
      startRiskEvaluator(addLog, 4002, agentState);
      startTreasuryRouter(addLog, 4002, agentState);
      agentState.initialized = true;
    }

    const now = Date.now();
    if (now - lastSimulationTick > SIMULATION_TICK_INTERVAL) {
      lastSimulationTick = now;
      console.log(`--- Serverless Simulation Tick Started: ${currentBaseUrl} ---`);
      
      if (agentState.triggerEvaluatorWithUrl) {
        try {
          await agentState.triggerEvaluatorWithUrl(currentBaseUrl);
        } catch (e) {
          console.error('Error ticking evaluator:', e);
        }
      }
      if (agentState.triggerRouterWithUrl) {
        try {
          await agentState.triggerRouterWithUrl(currentBaseUrl);
        } catch (e) {
          console.error('Error ticking router:', e);
        }
      }
      console.log('--- Serverless Simulation Tick Finished ---');
    }
  }
  next();
});

// Get full system state (frontend queries this)
app.get('/api/state', (req, res) => {
  const vault = LEDGER.contracts.AequitasVault;
  const risk = calculateRiskMetrics(vault.allocations, parseFloat(vault.totalDeposits), LEDGER.contracts);
  res.json({
    ledger: LEDGER,
    offChain: OFF_CHAIN_PREMIUM_SOURCE,
    compliance: LEDGER.compliance,
    risk: risk,
    logs: logs.slice(-50),
    agentAutomation
  });
});

app.get('/api/agent-control', (req, res) => {
  res.json({ agentAutomation });
});

app.post('/api/agent-control', (req, res) => {
  const { action } = req.body;
  if (action === 'pause') {
    agentAutomation = false;
    addLog('System', 'Autonomous Agent loops paused. Manual trigger mode enabled.', 'warning');
  } else if (action === 'resume') {
    agentAutomation = true;
    addLog('System', 'Autonomous Agent loops resumed.', 'info');
  }
  res.json({ success: true, agentAutomation });
});

app.post('/api/agent-trigger', (req, res) => {
  const { agent } = req.body;
  if (agent === 'evaluator' && agentState.triggerEvaluator) {
    agentState.triggerEvaluator();
  } else if (agent === 'router' && agentState.triggerRouter) {
    agentState.triggerRouter();
  } else {
    addLog('System', `Manual trigger failed for: ${agent} (Callback not ready)`, 'error');
    return res.status(400).json({ error: "Agent trigger callback not registered" });
  }
  res.json({ success: true });
});

// Compliance Screen API
app.post('/api/compliance/screen', (req, res) => {
  const { sender } = req.body;
  if (!LEDGER.accounts[sender]) {
    return res.status(404).json({ error: "Account not found" });
  }

  const proofHash = "0x" + Math.random().toString(16).substring(2, 10).toUpperCase() + "789F";
  LEDGER.compliance[sender] = {
    status: 'VERIFIED',
    proofHash
  };

  const txHash = "tx_kyc_" + Math.random().toString(36).substring(2, 9);
  const time = new Date().toLocaleTimeString();

  LEDGER.transactions.push({
    id: txHash,
    type: "CALL",
    sender,
    time,
    description: `Call AequitasVault.register_compliance_proof(${sender}, ${proofHash})`
  });

  addLog('Compliance Agent', `Sanctions screen approved for ${sender}. On-chain ZK-proof published. Hash: ${proofHash}`, 'success');

  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'COMPLIANCE_UPDATE', data: { compliance: LEDGER.compliance } }));
    }
  });

  res.json({ success: true, compliance: LEDGER.compliance[sender], txHash });
});

// Compliance Revoke API
app.post('/api/compliance/revoke', (req, res) => {
  const { sender } = req.body;
  
  LEDGER.compliance[sender] = {
    status: 'REVOKED',
    proofHash: null
  };

  const txHash = "tx_kyc_revoke_" + Math.random().toString(36).substring(2, 9);
  const time = new Date().toLocaleTimeString();

  LEDGER.transactions.push({
    id: txHash,
    type: "CALL",
    sender,
    time,
    description: `Call AequitasVault.register_compliance_proof(${sender}, 0x0)`
  });

  addLog('Compliance Agent', `Revoked compliance credential on-chain for ${sender}.`, 'warning');

  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'COMPLIANCE_UPDATE', data: { compliance: LEDGER.compliance } }));
    }
  });

  res.json({ success: true, compliance: LEDGER.compliance[sender], txHash });
});

// AI Goal Staking Endpoint (Interacts with the Swarm Orchestration timeline)
app.post('/api/ai/invest', async (req, res) => {
  const { prompt, sender } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing investment goal prompt" });
  }

  addLog('System', `AI Goal Initiated: "${prompt}" from ${sender}`, 'info');

  const broadcastState = (msg) => {
    wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(msg));
      }
    });
  };

  try {
    const result = await runOrchestration(prompt, 0, LEDGER, OFF_CHAIN_PREMIUM_SOURCE, addLog, broadcastState);

    const vault = LEDGER.contracts.AequitasVault;
    
    // Register ZK proof hash locally in the compliance ledger
    LEDGER.compliance[sender] = {
      status: 'VERIFIED',
      proofHash: result.zkProofHash
    };

    // Update Allocations based on dynamic calculations
    for (const [assetId, amount] of Object.entries(result.targetAllocations)) {
      vault.allocations[assetId] = amount.toFixed(2);
    }

    const txHash = "tx_ai_rebalance_" + Math.random().toString(36).substring(2, 9);
    const time = new Date().toLocaleTimeString();

    LEDGER.transactions.push({
      id: txHash,
      type: "CALL",
      sender,
      time,
      description: `AI Swarm Rebalance: "${prompt}"`
    });

    broadcastState({
      type: 'AI_CHAT_RESPONSE',
      data: {
        message: result.explanation,
        ledger: LEDGER
      }
    });

    res.json({ success: true, txHash });
  } catch (error) {
    console.error("AI Investment failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/deploy-rwa', (req, res) => {
  const { name, symbol, valuation, riskRating, yieldRate } = req.body;
  const assetId = symbol.toUpperCase();

  if (LEDGER.contracts[assetId]) {
    return res.status(400).json({ error: "Asset contract already exists" });
  }

  // Register in ledger contracts
  LEDGER.contracts[assetId] = {
    name,
    symbol,
    decimals: 9,
    totalSupply: "100000.00",
    valuation: valuation.toString(),
    riskRating,
    yieldRate: parseInt(yieldRate),
    issuer: "risk_evaluator_wallet",
    isActive: true
  };

  // Add to offchain premium source
  OFF_CHAIN_PREMIUM_SOURCE[assetId] = {
    valuation: parseInt(valuation),
    riskRating,
    yieldRate: parseInt(yieldRate)
  };

  // Add to vault allocations
  LEDGER.contracts.AequitasVault.allocations[assetId] = "0.00";

  const txHash = "tx_deploy_" + Math.random().toString(36).substring(2, 9);
  const time = new Date().toLocaleTimeString();

  LEDGER.transactions.push({
    id: txHash,
    type: "DEPLOY",
    sender: "risk_evaluator_wallet",
    time,
    description: `Deploy fractionalized RWA token contract ${assetId} (${name})`
  });

  addLog('Casper Network', `Deployed contract ${assetId} successfully. Issuer: risk_evaluator_wallet. Yield: ${(yieldRate/100).toFixed(2)}%, Risk: ${riskRating}`, 'success');

  // Broadcast layout update to all WS clients
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'LAYOUT_UPDATE', data: { ledger: LEDGER } }));
    }
  });

  res.json({ success: true, txHash, assetId });
});

app.post('/api/update-offchain', (req, res) => {
  const { assetId, valuation, riskRating, yieldRate } = req.body;

  if (!OFF_CHAIN_PREMIUM_SOURCE[assetId]) {
    return res.status(404).json({ error: "Asset not found" });
  }

  const asset = OFF_CHAIN_PREMIUM_SOURCE[assetId];
  const prevVal = asset.valuation;
  const prevRisk = asset.riskRating;
  const prevYield = asset.yieldRate;

  asset.valuation = parseInt(valuation);
  asset.riskRating = riskRating;
  asset.yieldRate = parseInt(yieldRate);

  addLog('System', `Asset parameter override: ${assetId}. Valuation: $${prevVal.toLocaleString()} -> $${asset.valuation.toLocaleString()}, Risk: ${prevRisk} -> ${riskRating}, Yield: ${(prevYield/100).toFixed(2)}% -> ${(yieldRate/100).toFixed(2)}%`, 'warning');

  res.json({ success: true, asset });
});

// Trigger macroeconomic events / shocks from frontend
app.post('/api/trigger-shock', (req, res) => {
  const { assetId, type } = req.body;
  if (!OFF_CHAIN_PREMIUM_SOURCE[assetId]) {
    return res.status(404).json({ error: "Asset not found" });
  }

  const asset = OFF_CHAIN_PREMIUM_SOURCE[assetId];
  const oldRating = asset.riskRating;
  const oldYield = asset.yieldRate;

  if (type === 'upgrade') {
    if (asset.riskRating === 'A') asset.riskRating = 'A+';
    else if (asset.riskRating === 'B+') asset.riskRating = 'A';
    else if (asset.riskRating === 'B-') asset.riskRating = 'B+';
    else if (asset.riskRating === 'C') asset.riskRating = 'B-';
    asset.yieldRate = Math.max(400, asset.yieldRate - 50); // lower risk, lower yield
    addLog('System', `Macro Upgrade: ${assetId} risk reduced. Rating: ${oldRating} -> ${asset.riskRating}, Yield: ${(oldYield/100).toFixed(2)}% -> ${(asset.yieldRate/100).toFixed(2)}%`, 'warning');
  } else if (type === 'downgrade') {
    if (asset.riskRating === 'A+') asset.riskRating = 'A';
    else if (asset.riskRating === 'A') asset.riskRating = 'B+';
    else if (asset.riskRating === 'B+') asset.riskRating = 'B-';
    else if (asset.riskRating === 'B-') asset.riskRating = 'C';
    asset.yieldRate = Math.min(1500, asset.yieldRate + 150); // higher risk, higher yield required
    addLog('System', `Macro Downgrade: ${assetId} defaults rising. Rating: ${oldRating} -> ${asset.riskRating}, Yield: ${(oldYield/100).toFixed(2)}% -> ${(asset.yieldRate/100).toFixed(2)}%`, 'warning');
  } else if (type === 'valuation_drop') {
    const oldVal = asset.valuation;
    asset.valuation = Math.round(asset.valuation * 0.85);
    addLog('System', `Macro Shock: Property devaluation on ${assetId}. Market price: $${oldVal.toLocaleString()} -> $${asset.valuation.toLocaleString()}`, 'warning');
  }

  res.json({ success: true, asset });
});

// Vault deposit endpoint
app.post('/api/deposit', (req, res) => {
  const { sender, amount } = req.body;
  const numAmount = parseFloat(amount);
  
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  // Compliance check
  const comp = LEDGER.compliance[sender] || { status: 'UNVERIFIED' };
  if (comp.status !== 'VERIFIED') {
    return res.status(403).json({ error: "Compliance Error: Non-compliant investor. Run KYC screening first." });
  }

  const userWallet = LEDGER.accounts[sender] || { balance: '0.00' };
  const userBalance = parseFloat(userWallet.balance);
  
  if (userBalance < numAmount) {
    return res.status(400).json({ error: "Insufficient balance in user wallet" });
  }

  // Update balances
  userWallet.balance = (userBalance - numAmount).toFixed(2);
  LEDGER.accounts[sender] = userWallet;

  const vault = LEDGER.contracts.AequitasVault;
  vault.balances[sender] = (parseFloat(vault.balances[sender] || '0') + numAmount).toFixed(2);
  vault.totalDeposits = (parseFloat(vault.totalDeposits) + numAmount).toFixed(2);
  
  const vaultWallet = LEDGER.accounts['aequitas_vault_contract'];
  vaultWallet.balance = (parseFloat(vaultWallet.balance) + numAmount).toFixed(2);

  const txId = "tx_" + Math.random().toString(36).substring(2, 9);
  const time = new Date().toLocaleTimeString();
  
  const tx = { id: txId, type: "CALL", sender, time, description: `Deposit ${numAmount.toLocaleString()} CSPR to Vault` };
  LEDGER.transactions.push(tx);

  addLog('Casper Network', `Tx ${txId} Succeeded: Deposit ${numAmount} CSPR from ${sender}`, 'transaction');
  res.json({ success: true, balance: userWallet.balance, vaultDeposits: vault.balances[sender] });
});

// Vault withdraw endpoint
app.post('/api/withdraw', (req, res) => {
  const { sender, amount } = req.body;
  const numAmount = parseFloat(amount);

  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  // Compliance check
  const comp = LEDGER.compliance[sender] || { status: 'UNVERIFIED' };
  if (comp.status !== 'VERIFIED') {
    return res.status(403).json({ error: "Compliance Error: Non-compliant investor. Run KYC screening first." });
  }

  const vault = LEDGER.contracts.AequitasVault;
  const userVaultBalance = parseFloat(vault.balances[sender] || '0');

  if (userVaultBalance < numAmount) {
    return res.status(400).json({ error: "Insufficient deposits in AequitasVault" });
  }

  // Check if vault contract has enough liquid CSPR (unallocated)
  const totalAllocated = Object.values(vault.allocations).reduce((a, b) => a + parseFloat(b), 0);
  const totalVaultCSPR = parseFloat(LEDGER.accounts['aequitas_vault_contract'].balance);
  const liquidCSPR = totalVaultCSPR - totalAllocated;

  if (liquidCSPR < numAmount) {
    return res.status(400).json({ error: `Insufficient vault liquidity. ${liquidCSPR.toFixed(2)} CSPR available (unallocated). Wait for agents to reallocate.` });
  }

  // Update state
  vault.balances[sender] = (userVaultBalance - numAmount).toFixed(2);
  vault.totalDeposits = (parseFloat(vault.totalDeposits) - numAmount).toFixed(2);

  const userWallet = LEDGER.accounts[sender] || { balance: '0.00' };
  userWallet.balance = (parseFloat(userWallet.balance) + numAmount).toFixed(2);
  LEDGER.accounts[sender] = userWallet;

  const vaultWallet = LEDGER.accounts['aequitas_vault_contract'];
  vaultWallet.balance = (parseFloat(vaultWallet.balance) - numAmount).toFixed(2);

  const txId = "tx_" + Math.random().toString(36).substring(2, 9);
  const time = new Date().toLocaleTimeString();

  const tx = { id: txId, type: "CALL", sender, time, description: `Withdraw ${numAmount.toLocaleString()} CSPR from Vault` };
  LEDGER.transactions.push(tx);

  addLog('Casper Network', `Tx ${txId} Succeeded: Withdraw ${numAmount} CSPR to ${sender}`, 'transaction');
  res.json({ success: true, balance: userWallet.balance, vaultDeposits: vault.balances[sender] });
});

// ----------------------------------------------------
// x402 Micropayments Protocol Implementations
// ----------------------------------------------------

app.get('/api/premium-data', (req, res) => {
  const { assetId } = req.query;
  const authHeader = req.headers['authorization'];

  if (!assetId || !OFF_CHAIN_PREMIUM_SOURCE[assetId]) {
    return res.status(404).json({ error: "Asset not found" });
  }

  // Check if authorized using Casper-x402 protocol
  if (authHeader && authHeader.startsWith('Casper-x402 ')) {
    const paymentProof = authHeader.replace('Casper-x402 ', '');
    const [txHash, payRef] = paymentProof.split(':');

    // Validate the payment hash exists and was settled
    if (pendingPayments.has(payRef)) {
      const paymentInfo = pendingPayments.get(payRef);
      if (paymentInfo.settled && paymentInfo.txHash === txHash && paymentInfo.assetId === assetId) {
        addLog('x402 Facilitator', `Validation Successful. Proof ${txHash.substring(0, 10)}... settled for reference ${payRef}.`, 'success');
        
        const data = OFF_CHAIN_PREMIUM_SOURCE[assetId];
        return res.json({
          status: 200,
          assetId,
          data
        });
      }
    }
    
    addLog('x402 Facilitator', `Validation Failed. Invalid proof: ${paymentProof}`, 'error');
    return res.status(403).json({ error: "Invalid or Unsettled Payment Signature" });
  }

  // Payment Required! Respond with HTTP 402
  const payRef = 'pay_' + Math.random().toString(36).substring(2, 12);
  const payAmount = "0.10"; // 0.10 CSPR per request
  
  pendingPayments.set(payRef, {
    assetId,
    amount: payAmount,
    destination: 'cspr_premium_api_vault',
    settled: false,
    txHash: null
  });

  res.setHeader('X-402-Payment-Amount', payAmount);
  res.setHeader('X-402-Destination', 'cspr_premium_api_vault');
  res.setHeader('X-402-Payment-Reference', payRef);
  res.setHeader('X-402-Token-Denomination', 'CSPR');

  addLog('x402 Facilitator', `Asset ${assetId} request requires payment of ${payAmount} CSPR. Reference: ${payRef}`, 'payment');

  res.status(402).json({
    status: 402,
    error: "Payment Required",
    amount: payAmount,
    destination: 'cspr_premium_api_vault',
    reference: payRef,
    denom: 'CSPR'
  });
});

// Settlement API for x402 Micropayments
app.post('/api/x402/settle', (req, res) => {
  const { sender, reference, signature } = req.body;

  if (!pendingPayments.has(reference)) {
    return res.status(404).json({ error: "Payment reference not found or expired" });
  }

  const payment = pendingPayments.get(reference);
  if (payment.settled) {
    return res.status(400).json({ error: "Payment reference already settled" });
  }

  const amountNum = parseFloat(payment.amount);
  const senderWallet = LEDGER.accounts[sender];

  if (!senderWallet || parseFloat(senderWallet.balance) < amountNum) {
    addLog('x402 Facilitator', `Settlement Rejected. ${sender} has insufficient balance.`, 'error');
    return res.status(400).json({ error: "Insufficient balance for settlement" });
  }

  // Deduct from agent, add to premium api vault
  senderWallet.balance = (parseFloat(senderWallet.balance) - amountNum).toFixed(2);
  const destWallet = LEDGER.accounts[payment.destination];
  destWallet.balance = (parseFloat(destWallet.balance) + amountNum).toFixed(2);

  const txHash = "tx_x402_" + Math.random().toString(36).substring(2, 9);
  const time = new Date().toLocaleTimeString();

  // Record transaction on Casper Ledger
  LEDGER.transactions.push({
    id: txHash,
    type: "TRANSFER",
    sender,
    time,
    description: `x402 Micropayment ${amountNum} CSPR to Premium Data Provider (Ref: ${reference})`
  });

  // Mark reference settled
  payment.settled = true;
  payment.txHash = txHash;
  pendingPayments.set(reference, payment);

  addLog('x402 Facilitator', `Settlement Approved. Ref: ${reference}. Transferred ${amountNum} CSPR from ${sender}. Hash: ${txHash}`, 'payment');

  res.json({
    success: true,
    txHash,
    amount: payment.amount,
    reference
  });
});

// Submit on-chain update (Risk Evaluator posts to smart contract)
app.post('/api/contracts/update-asset', (req, res) => {
  const { sender, contractAddress, valuation, riskRating, yieldRate } = req.body;

  const contract = LEDGER.contracts[contractAddress];
  if (!contract) {
    return res.status(404).json({ error: "Contract not found" });
  }

  if (sender !== contract.issuer) {
    return res.status(403).json({ error: "Sender unauthorized to write contract metadata" });
  }

  // Update Contract State in Ledger
  const prevVal = contract.valuation;
  const prevRisk = contract.riskRating;
  const prevYield = contract.yieldRate;

  contract.valuation = valuation.toString();
  contract.riskRating = riskRating;
  contract.yieldRate = parseInt(yieldRate);

  const txHash = "tx_" + Math.random().toString(36).substring(2, 9);
  const time = new Date().toLocaleTimeString();

  LEDGER.transactions.push({
    id: txHash,
    type: "CALL",
    sender,
    time,
    description: `Call ${contractAddress}.update_asset_data(${valuation}, "${riskRating}", ${yieldRate})`
  });

  addLog('Casper Network', `Contract ${contractAddress} state updated: Valuation $${parseFloat(prevVal).toLocaleString()} -> $${valuation.toLocaleString()}, Risk ${prevRisk} -> ${riskRating}, Yield ${(prevYield/100).toFixed(2)}% -> ${(yieldRate/100).toFixed(2)}%`, 'success');

  res.json({ success: true, txHash });
});

// Execute Vault reallocations (Treasury Router calls)
app.post('/api/contracts/vault-reallocate', (req, res) => {
  const { sender, allocations } = req.body;

  const vault = LEDGER.contracts.AequitasVault;
  if (sender !== vault.router) {
    return res.status(403).json({ error: "Unauthorized router call" });
  }

  const txHash = "tx_" + Math.random().toString(36).substring(2, 9);
  const time = new Date().toLocaleTimeString();

  // Validate allocations add up to TVL or less
  const targetTotal = Object.values(allocations).reduce((a, b) => a + parseFloat(b), 0);
  const totalDeposits = parseFloat(vault.totalDeposits);

  if (targetTotal > totalDeposits) {
    return res.status(400).json({ error: `Cannot allocate more than total deposits of ${totalDeposits} CSPR` });
  }

  // Update Allocations
  const allocationChanges = [];
  for (const [rwaToken, newAmount] of Object.entries(allocations)) {
    const oldAmount = parseFloat(vault.allocations[rwaToken] || '0');
    const newAmountNum = parseFloat(newAmount);
    vault.allocations[rwaToken] = newAmountNum.toFixed(2);
    
    if (oldAmount !== newAmountNum) {
      allocationChanges.push(`${rwaToken}: ${oldAmount.toLocaleString()} -> ${newAmountNum.toLocaleString()} CSPR`);
    }
  }

  LEDGER.transactions.push({
    id: txHash,
    type: "CALL",
    sender,
    time,
    description: `Call AequitasVault.reallocate_capital() - updates portfolio distribution`
  });

  addLog('Casper Network', `Vault Reallocation Complete: ${allocationChanges.join(', ')}`, 'success');

  res.json({ success: true, txHash });
});

// Casper Testnet RPC Status checker
app.get('/api/casper/status', async (req, res) => {
  try {
    const response = await fetch('https://node.testnet.casper.network/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'info_get_status',
        id: 1
      }),
      signal: AbortSignal.timeout(4000)
    });

    if (!response.ok) {
      throw new Error(`RPC status returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data && data.result) {
      const height = data.result.last_added_block_info ? data.result.last_added_block_info.height : null;
      const chain = data.result.chainspec_name || 'casper-testnet';
      const version = data.result.api_version || 'unknown';
      return res.json({
        status: 'CONNECTED',
        blockHeight: height,
        chain: chain,
        version: version
      });
    }
    throw new Error('Invalid RPC response format');
  } catch (error) {
    return res.json({
      status: 'OFFLINE',
      blockHeight: null,
      chain: 'casper-testnet',
      error: error.message
    });
  }
});

// RPC Broadcast endpoint for signed Casper deploys
app.post('/api/casper/broadcast', async (req, res) => {
  const { signedDeploy } = req.body;
  if (!signedDeploy) {
    return res.status(400).json({ error: "Missing signed deploy payload" });
  }

  try {
    const rpcRes = await fetch('https://node.testnet.casper.network/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'account_put_deploy',
        params: signedDeploy,
        id: 1
      })
    });

    const rpcData = await rpcRes.json();
    if (rpcData.error) {
      return res.status(400).json({ error: rpcData.error.message });
    }

    const deployHash = rpcData.result.deploy_hash;
    addLog('Casper Network', `Deploy broadcasted successfully. Deploy Hash: ${deployHash}`, 'success');
    res.json({ success: true, deployHash });
  } catch (err) {
    console.error("RPC broadcast failed:", err);
    res.status(500).json({ error: "Failed to broadcast transaction to Casper Testnet: " + err.message });
  }
});

// GET deploy status polling endpoint
app.get('/api/casper/deploy-status', async (req, res) => {
  const { hash } = req.query;
  if (!hash) {
    return res.status(400).json({ error: "Missing deploy hash" });
  }

  try {
    const rpcRes = await fetch('https://node.testnet.casper.network/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'info_get_deploy',
        params: { deploy_hash: hash },
        id: 1
      })
    });

    const rpcData = await rpcRes.json();
    if (rpcData.error) {
      return res.json({ confirmed: false, error: rpcData.error.message });
    }

    const executionResults = rpcData.result.execution_results || [];
    const confirmed = executionResults.length > 0;
    const success = confirmed && !executionResults[0].result.Failure;

    res.json({
      confirmed,
      success,
      deploy: rpcData.result.deploy
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to serialize U512 to little-endian bytes string for Casper
function serializeU512(value) {
  try {
    const bigIntValue = BigInt(value);
    let hex = bigIntValue.toString(16);
    if (hex.length % 2 !== 0) {
      hex = '0' + hex;
    }
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    bytes.reverse(); // Casper values are little-endian
    const len = bytes.length;
    const lenHex = len.toString(16).padStart(2, '0');
    const bytesHex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    return lenHex + bytesHex;
  } catch (e) {
    console.error("U512 serialization failed for value:", value, e);
    return "0100"; // fallback
  }
}

// Helper to generate a valid 64-character hex string representing a hash
function generateRandomHex32() {
  let hex = '';
  for (let i = 0; i < 64; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex;
}

// Build deploy mock template for Signer signing
app.post('/api/casper/build-deploy', (req, res) => {
  const { entrypoint, sender, args } = req.body;
  if (!sender) {
    return res.status(400).json({ error: "Missing sender public key" });
  }

  // Process arguments to guarantee cl_type objects are populated with valid bytes strings
  const processedArgs = (args || []).map(arg => {
    if (Array.isArray(arg) && arg.length === 2) {
      const [name, valObj] = arg;
      if (valObj && valObj.cl_type === 'U512' && !valObj.bytes) {
        valObj.bytes = serializeU512(valObj.parsed);
      }
      return [name, valObj];
    }
    return arg;
  });

  const deploy = {
    hash: generateRandomHex32(),
    header: {
      account: sender,
      timestamp: Date.now(),
      ttl: "30m",
      gas_price: 1,
      body_hash: generateRandomHex32(),
      dependencies: [],
      chain_name: "casper-testnet"
    },
    payment: {
      ModuleBytes: {
        args: [
          ["amount", { cl_type: "U512", bytes: "0400e87a48", parsed: "150000000" }]
        ]
      }
    },
    session: {
      StoredContractByHash: {
        hash: "0a12e340c21342621743f5509ba09d01a5511b816ba7b778c1ef1d0d9cf1d4f2", // Casper Testnet Vault contract hash
        entry_point: entrypoint,
        args: processedArgs
      }
    },
    approvals: []
  };

  res.json({ deploy });
});



// ----------------------------------------------------
// Setup Server Listen & WebSocket Upgrade
// ----------------------------------------------------
const PORT = 4002;
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  // calculate current risk metrics for init state
  const vault = LEDGER.contracts.AequitasVault;
  const risk = calculateRiskMetrics(vault.allocations, parseFloat(vault.totalDeposits), LEDGER.contracts);
  ws.send(JSON.stringify({ 
    type: 'INIT_STATE', 
    data: { 
      ledger: LEDGER, 
      offChain: OFF_CHAIN_PREMIUM_SOURCE, 
      compliance: LEDGER.compliance,
      risk,
      logs, 
      agentAutomation 
    } 
  }));
});

if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Aequitas RWA Casper Swarm Network Emulator Running`);
    console.log(`HTTP/WS Server: http://localhost:${PORT}`);
    console.log(`====================================================`);
    
    // Add initial logs
    addLog('System', 'Aequitas RWA blockchain network simulator boot completed.', 'info');
    addLog('System', 'MCP client server connected. Active nodes: Risk Evaluator, Treasury Router.', 'info');

    // Start the autonomous agents!
    startRiskEvaluator(addLog, PORT, agentState);
    startTreasuryRouter(addLog, PORT, agentState);
  });
}

export default app;
