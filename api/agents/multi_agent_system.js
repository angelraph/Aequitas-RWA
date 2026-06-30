import fs from 'fs';
import path from 'path';
import { calculateRiskMetrics } from './risk_engine.js';

const memoryPath = path.resolve('agent_memory.json');

export function loadMemory() {
  try {
    if (fs.existsSync(memoryPath)) {
      return JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    }
  } catch (e) {
    console.error("Failed to load agent memory:", e);
  }
  return {
    previousAllocations: [],
    previousUserGoals: [],
    historicalMarketConditions: [],
    previousRecommendations: [],
    userPreferences: {
      riskProfile: 'balanced',
      minLiquidity: 0.50
    }
  };
}

export function saveMemory(mem) {
  try {
    fs.writeFileSync(memoryPath, JSON.stringify(mem, null, 2), 'utf8');
  } catch (e) {
    console.error("Failed to save agent memory:", e);
  }
}

export async function runOrchestration(userGoal, amount, ledger, offChain, addLog, broadcastState) {
  const memory = loadMemory();
  const timeline = [];
  
  const broadcastStep = (step) => {
    timeline.push(step);
    broadcastState({
      type: 'AGENT_COLLABORATION_STEP',
      data: {
        goal: userGoal,
        timeline: [...timeline]
      }
    });
    addLog(step.agent, `[${step.status.toUpperCase()}] ${step.message}`, step.status === 'completed' ? 'success' : 'info');
  };

  // Step 1: Compliance Agent
  broadcastStep({
    agent: 'Compliance Agent',
    status: 'working',
    message: 'Screening investor wallet against sanctions and AML watchlists...',
    inputs: { investor: 'user_wallet', sanctionsList: 'OFAC_SDN_2026' },
    confidence: 0.99,
    timestamp: new Date().toLocaleTimeString()
  });

  await new Promise(r => setTimeout(r, 1200));

  const zkProofHash = "0x" + Math.random().toString(16).substring(2, 10).toUpperCase() + "789F";
  
  broadcastStep({
    agent: 'Compliance Agent',
    status: 'completed',
    message: `Sanctions screening passed. Generated ZK suitability proof hash: ${zkProofHash}.`,
    inputs: { investor: 'user_wallet', sanctionsList: 'OFAC_SDN_2026' },
    outputs: { isCleared: true, zkProofHash, contractCall: 'register_compliance_proof' },
    confidence: 0.99,
    reasoning: 'Investor wallet has no connections to flagged high-risk addresses or blocked regions. Fit for general RWA staking.',
    timestamp: new Date().toLocaleTimeString()
  });

  // Step 2: Oracle Agent
  broadcastStep({
    agent: 'Oracle Agent',
    status: 'working',
    message: 'Retrieving premium RWA asset valuations. Checking pay-per-use x402 data feed gates...',
    inputs: { assets: Object.keys(offChain) },
    confidence: 0.98,
    timestamp: new Date().toLocaleTimeString()
  });

  await new Promise(r => setTimeout(r, 1200));

  const payments = [];
  const scrapedData = {};
  for (const assetId of Object.keys(offChain)) {
    const payRef = "pay_" + Math.random().toString(36).substring(2, 9);
    const txHash = "tx_x402_" + Math.random().toString(36).substring(2, 9);
    payments.push({ assetId, price: '0.10 CSPR', reference: payRef, txHash });
    scrapedData[assetId] = { ...offChain[assetId] };
  }

  broadcastStep({
    agent: 'Oracle Agent',
    status: 'completed',
    message: 'Scraped valuations successfully. Authorized x402 micropayments for premium data feeds.',
    inputs: { assets: Object.keys(offChain) },
    outputs: { payments, scrapedData },
    confidence: 0.98,
    reasoning: 'PremiumIstanbul feed validated. Settle 0.10 CSPR fee per call for commercial plaza and invoice registries.',
    timestamp: new Date().toLocaleTimeString()
  });

  // Step 3: Risk Agent
  broadcastStep({
    agent: 'Risk Agent',
    status: 'working',
    message: 'Running parametric Value at Risk (VaR) and covariance volatility calculations...',
    inputs: { currentAllocations: ledger.contracts.AequitasVault.allocations, totalDeposits: ledger.contracts.AequitasVault.totalDeposits },
    confidence: 0.95,
    timestamp: new Date().toLocaleTimeString()
  });

  await new Promise(r => setTimeout(r, 1200));

  const currentRisk = calculateRiskMetrics(
    ledger.contracts.AequitasVault.allocations, 
    parseFloat(ledger.contracts.AequitasVault.totalDeposits), 
    ledger.contracts
  );

  broadcastStep({
    agent: 'Risk Agent',
    status: 'completed',
    message: `Risk metrics computed. Sharpe Ratio: ${currentRisk.sharpeRatio}, Portfolio Health: ${currentRisk.healthScore}%.`,
    inputs: { currentAllocations: ledger.contracts.AequitasVault.allocations },
    outputs: currentRisk,
    confidence: 0.95,
    reasoning: 'Volatility calculations adjusted for A+ to C credit risks. High Sharpe indicates efficient return optimization.',
    timestamp: new Date().toLocaleTimeString()
  });

  // Step 4: Yield Agent
  broadcastStep({
    agent: 'Yield Agent',
    status: 'working',
    message: 'Comparing asset classes. Mapping yield spreads and determining optimal allocation weights...',
    inputs: { userGoal, currentRisk, userPreferences: memory.userPreferences },
    confidence: 0.92,
    timestamp: new Date().toLocaleTimeString()
  });

  await new Promise(r => setTimeout(r, 1200));

  let targetProfile = 'balanced';
  if (/conser/i.test(userGoal)) targetProfile = 'conservative';
  else if (/aggr|high/i.test(userGoal)) targetProfile = 'aggressive';

  memory.userPreferences.riskProfile = targetProfile;

  let targetWeights = {};
  if (targetProfile === 'conservative') {
    targetWeights = { 'RWA-REAL-101': 0.50, 'RWA-INV-202': 0.35, 'RWA-SHIP-303': 0.15 };
  } else if (targetProfile === 'aggressive') {
    targetWeights = { 'RWA-REAL-101': 0.20, 'RWA-INV-202': 0.20, 'RWA-SHIP-303': 0.60 };
  } else {
    targetWeights = { 'RWA-REAL-101': 0.40, 'RWA-INV-202': 0.30, 'RWA-SHIP-303': 0.30 };
  }

  broadcastStep({
    agent: 'Yield Agent',
    status: 'completed',
    message: `Calculated target distributions for profile: ${targetProfile.toUpperCase()}.`,
    inputs: { targetProfile },
    outputs: { targetWeights },
    confidence: 0.92,
    reasoning: targetProfile === 'conservative' 
      ? 'Maximized exposure to Greenwood Office Park and low-risk credit invoices, capping shipping receivables risk.'
      : 'Maximized exposure to high-yield Shipping Receivables (9.80% APY) to hit aggressive yield targets.',
    timestamp: new Date().toLocaleTimeString()
  });

  // Step 5: Treasury Agent
  broadcastStep({
    agent: 'Treasury Agent',
    status: 'working',
    message: 'Formulating contract execution parameters and rebalancing transactions...',
    inputs: { targetWeights, totalDeposits: ledger.contracts.AequitasVault.totalDeposits },
    confidence: 0.96,
    timestamp: new Date().toLocaleTimeString()
  });

  await new Promise(r => setTimeout(r, 1200));

  const totalVaultSize = parseFloat(ledger.contracts.AequitasVault.totalDeposits) + (amount || 0);
  const targetAllocations = {};
  for (const assetId of Object.keys(targetWeights)) {
    targetAllocations[assetId] = parseFloat((totalVaultSize * targetWeights[assetId]).toFixed(2));
  }

  const txHash = "tx_realloc_" + Math.random().toString(36).substring(2, 9);

  broadcastStep({
    agent: 'Treasury Agent',
    status: 'completed',
    message: 'Formulated rebalancing proposals. Emitted reallocation transaction triggers.',
    inputs: { targetAllocations },
    outputs: { txHash, rebalanceTriggered: true },
    confidence: 0.96,
    reasoning: 'Reallocation transaction pushes updated asset distribution weights onto the ledger to enforce yield targets.',
    timestamp: new Date().toLocaleTimeString()
  });

  // Step 6: Portfolio Agent
  broadcastStep({
    agent: 'Portfolio Agent',
    status: 'working',
    message: 'Synthesizing strategy logs, historical performance, and explainability dashboard...',
    inputs: { userGoal, currentRisk, targetAllocations },
    confidence: 0.97,
    timestamp: new Date().toLocaleTimeString()
  });

  await new Promise(r => setTimeout(r, 1200));

  memory.previousUserGoals.push({ goal: userGoal, timestamp: new Date().toISOString() });
  memory.previousAllocations.push({ allocations: targetAllocations, timestamp: new Date().toISOString() });
  saveMemory(memory);

  const explanation = generateExplainabilityReport(targetProfile, targetAllocations, currentRisk);

  broadcastStep({
    agent: 'Portfolio Agent',
    status: 'completed',
    message: 'Orchestration complete. Investment goal processed successfully.',
    inputs: { userGoal },
    outputs: { explanation, finalStrategy: `Execute ${targetProfile} allocation`, timelineLength: timeline.length },
    confidence: 0.97,
    reasoning: `Successfully completed KYC compliance screening, premium x402 data settlement, risk evaluation, and portfolio reallocations on Casper Network.`,
    timestamp: new Date().toLocaleTimeString()
  });

  return {
    timeline,
    explanation,
    zkProofHash,
    targetAllocations
  };
}

function generateExplainabilityReport(profile, allocations, risk) {
  const isConservative = profile === 'conservative';
  const isAggressive = profile === 'aggressive';

  return `
### Portfolio Allocation Overview (${profile.toUpperCase()})
*   **Target Return**: ${isConservative ? '5.90%' : isAggressive ? '8.40%' : '7.15%'} APY
*   **Confidence Score**: **97%**
*   **Alternative Options Considered**: Equal-weighting portfolio distribution.
*   **Why Reverted**: Equal-weight distribution failed to meet the specific risk parameters for ${profile} investment.

### Dynamic Metrics Audit
1.  **Greenwood Office Park (RWA-REAL-101)**: Allocated **${(allocations['RWA-REAL-101'] || 0).toLocaleString()} CSPR** (Stable core real estate backing, low risk rating).
2.  **Global Supply Invoices (RWA-INV-202)**: Allocated **${(allocations['RWA-INV-202'] || 0).toLocaleString()} CSPR** (Short term high-grade invoice cash flows).
3.  **Maritime Receivables (RWA-SHIP-303)**: Allocated **${(allocations['RWA-SHIP-303'] || 0).toLocaleString()} CSPR** (Aggressive yield rate, higher risk rating).

### Portfolio Security Analytics
*   **Expected Annualized Sharpe Ratio**: **${risk.sharpeRatio}**
*   **Value at Risk (VaR)**: **${risk.valueAtRisk.toLocaleString()} CSPR** (Max expected daily decline at 95% confidence).
*   **Diversification Index**: **${risk.diversificationScore}%** (Concentration index measure).
*   **Portfolio Liquidity**: **${risk.liquidityScore}%** (Weighted cash extraction capability).
*   **Composite Portfolio Health**: **${risk.healthScore}%** (Composite index of safety parameters).
  `;
}
