// Treasury Router Agent

const RISK_MULTIPLIERS = {
  'A+': 1.0,
  'A': 1.05,
  'B+': 1.20,
  'B-': 1.40,
  'C': 1.80
};

export function startTreasuryRouter(addLog, apiPort = 4002, agentState = {}) {
  const agentName = 'Treasury Router';
  const BASE_URL = `http://localhost:${apiPort}`;

  addLog(agentName, "Agent started. Monitoring Casper Vault yields and RWA risk scoring...", "info");

  agentState.triggerRouter = () => performRebalancing(true);

  async function performRebalancing(isManual = false) {
    if (!isManual && agentState.getAutomation && !agentState.getAutomation()) {
      return;
    }
    try {
      // 1. Fetch current on-chain state
      const stateRes = await fetch(`${BASE_URL}/api/state`);
      const { ledger } = await stateRes.json();
      
      const vault = ledger.contracts.AequitasVault;
      const totalDeposits = parseFloat(vault.totalDeposits);

      if (totalDeposits <= 0) {
        addLog(agentName, "Vault has 0 deposits. Postponing rebalancing cycle.", "info");
        return;
      }

      // 2. Fetch all RWA tokens and calculate yields and risk scores
      const assets = Object.keys(ledger.contracts).filter(k => k.startsWith('RWA-'));
      const scores = {};
      let totalScore = 0;

      for (const assetId of assets) {
        const contract = ledger.contracts[assetId];
        const yieldRate = contract.yieldRate; // e.g. 850 for 8.5%
        const rating = contract.riskRating; // e.g. "B+"
        
        const multiplier = RISK_MULTIPLIERS[rating] || 1.5;
        // Yield Score = Yield Rate / Risk Multiplier
        const score = yieldRate / multiplier;
        
        // Use a power of score to create stronger preference for optimal yield routing
        const weightScore = Math.pow(score, 1.8); 
        scores[assetId] = weightScore;
        totalScore += weightScore;
      }

      // 3. Compute target allocations in CSPR
      const targets = {};
      addLog(agentName, "Recalculating optimal portfolio distributions based on risk-reward profiles...", "info");
      
      for (const assetId of assets) {
        const targetPercent = totalScore > 0 ? (scores[assetId] / totalScore) : 0;
        const targetCSPR = parseFloat((totalDeposits * targetPercent).toFixed(2));
        targets[assetId] = targetCSPR;
        
        const yieldPercent = (ledger.contracts[assetId].yieldRate / 100).toFixed(2);
        const rating = ledger.contracts[assetId].riskRating;
        addLog(agentName, `Target allocation for ${assetId} (${rating}, Yield: ${yieldPercent}%): ${(targetPercent*100).toFixed(1)}% (${targetCSPR.toLocaleString()} CSPR)`, "info");
      }

      // 4. Compare current vs target allocations to decide if rebalance is needed
      let rebalanceNeeded = false;
      const currentAllocations = vault.allocations;
      const proposedAllocations = {};

      for (const assetId of assets) {
        const currentVal = parseFloat(currentAllocations[assetId] || '0');
        const targetVal = targets[assetId];
        const diff = Math.abs(currentVal - targetVal);

        // Rebalance if deviation is greater than 3% of the total assets or 1,000 CSPR
        if (diff > (totalDeposits * 0.03) || diff > 1000) {
          rebalanceNeeded = true;
        }
        proposedAllocations[assetId] = targetVal;
      }

      if (rebalanceNeeded) {
        addLog(agentName, "Portfolio deviation threshold exceeded. Preparing reallocation transaction...", "warning");

        // 5. Submit reallocation transaction to Vault Contract
        const reallocateRes = await fetch(`${BASE_URL}/api/contracts/vault-reallocate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: 'treasury_router_wallet',
            allocations: proposedAllocations
          })
        });

        if (reallocateRes.ok) {
          const txResult = await reallocateRes.json();
          addLog(agentName, `Successfully routed vault liquidity. Portfolio rebalanced! Block Settled. Tx Hash: ${txResult.txHash}`, "success");
        } else {
          addLog(agentName, "Reallocation transaction failed.", "error");
        }
      } else {
        addLog(agentName, "Portfolio is optimal. Current allocations match targets within threshold.", "success");
      }

    } catch (error) {
      addLog(agentName, `Error in rebalancing cycle: ${error.message}`, "error");
    }
  }

  // Run rebalancing cycle immediately, then every 12 seconds (staggered by 6s from evaluator)
  setTimeout(() => {
    performRebalancing();
    setInterval(performRebalancing, 12000);
  }, 6000);
}
