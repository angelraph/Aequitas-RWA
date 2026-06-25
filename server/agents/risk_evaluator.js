// Risk Evaluator Agent

export function startRiskEvaluator(addLog, apiPort = 4002, agentState = {}) {
  const agentName = 'Risk Evaluator';
  const BASE_URL = `http://localhost:${apiPort}`;

  addLog(agentName, "Agent started. Monitoring real-world asset (RWA) risk channels...", "info");

  agentState.triggerEvaluator = () => checkAssets(true);

  async function checkAssets(isManual = false) {
    if (!isManual && agentState.getAutomation && !agentState.getAutomation()) {
      return;
    }
    try {
      // 1. Fetch current on-chain state to find registered RWA contracts
      const stateRes = await fetch(`${BASE_URL}/api/state`);
      const { ledger } = await stateRes.json();
      const assets = Object.keys(ledger.contracts).filter(k => k.startsWith('RWA-'));

      for (const assetId of assets) {
        addLog(agentName, `Analyzing market conditions for ${assetId}...`, "info");
        
        // 2. Fetch premium valuation/risk data (This is where x402 comes in)
        const premiumUrl = `${BASE_URL}/api/premium-data?assetId=${assetId}`;
        let response = await fetch(premiumUrl);

        if (response.status === 402) {
          // Get payment requirements from headers or body
          const amount = response.headers.get('X-402-Payment-Amount') || "0.10";
          const destination = response.headers.get('X-402-Destination');
          const reference = response.headers.get('X-402-Payment-Reference');
          
          addLog(agentName, `HTTP 402 Payment Required for ${assetId}. Price: ${amount} CSPR. Ref: ${reference}`, "payment");

          // 3. Perform micropayment settlement
          // In Casper's production x402, the agent generates a signature authorization
          const payload = {
            sender: 'risk_evaluator_wallet',
            reference: reference,
            signature: `sig_eval_${Math.random().toString(36).substring(2, 10)}`
          };

          addLog(agentName, `Authorizing micropayment of ${amount} CSPR. Signing reference ${reference}...`, "info");
          
          const settleRes = await fetch(`${BASE_URL}/api/x402/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!settleRes.ok) {
            addLog(agentName, `Micropayment failed for reference ${reference}. Skipping asset.`, "error");
            continue;
          }

          const receipt = await settleRes.json();
          addLog(agentName, `Payment settled. Transaction Hash: ${receipt.txHash.substring(0, 12)}...`, "payment");

          // 4. Retry premium data fetch with payment authorization proof
          response = await fetch(premiumUrl, {
            headers: {
              'Authorization': `Casper-x402 ${receipt.txHash}:${reference}`
            }
          });
        }

        if (response.status === 200) {
          const result = await response.json();
          const { valuation, riskRating, yieldRate } = result.data;
          
          addLog(agentName, `Retrieved premium metrics for ${assetId}: Valuation $${valuation.toLocaleString()}, Risk: ${riskRating}, Yield: ${(yieldRate/100).toFixed(2)}%`, "success");

          // 5. Compare with current on-chain state to check if update is needed
          const currentOnChain = ledger.contracts[assetId];
          const needsUpdate = 
            currentOnChain.valuation !== valuation.toString() ||
            currentOnChain.riskRating !== riskRating ||
            currentOnChain.yieldRate !== yieldRate;

          if (needsUpdate) {
            addLog(agentName, `Discrepancy detected for ${assetId}. Initiating Casper Smart Contract update transaction...`, "warning");
            
            const updateRes = await fetch(`${BASE_URL}/api/contracts/update-asset`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sender: 'risk_evaluator_wallet',
                contractAddress: assetId,
                valuation,
                riskRating,
                yieldRate
              })
            });

            if (updateRes.ok) {
              const txResult = await updateRes.json();
              addLog(agentName, `Successfully updated ${assetId} contract state. Block settled. Tx Hash: ${txResult.txHash}`, "success");
            } else {
              addLog(agentName, `Contract update transaction failed for ${assetId}.`, "error");
            }
          } else {
            addLog(agentName, `On-chain data for ${assetId} matches current off-chain pricing. No update needed.`, "success");
          }
        } else {
          addLog(agentName, `Failed to retrieve premium data for ${assetId}. Status: ${response.status}`, "error");
        }
      }
    } catch (error) {
      addLog(agentName, `Error in evaluator cycle: ${error.message}`, "error");
    }
  }

  // Run evaluator cycle immediately, then every 12 seconds
  checkAssets();
  const interval = setInterval(checkAssets, 12000);
  return interval;
}
