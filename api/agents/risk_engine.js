// Aequitas Portfolio Risk Engine

const RISK_VOLATILITIES = {
  'A+': 0.02,
  'A': 0.05,
  'B+': 0.08,
  'B-': 0.12,
  'C': 0.20
};

const LIQUIDITY_WEIGHTS = {
  'RWA-REAL-101': 0.30, // Real estate is illiquid
  'RWA-INV-202': 0.70,  // Invoices are highly liquid
  'RWA-SHIP-303': 0.50,  // Shipping receivables are medium liquid
};

export function calculateRiskMetrics(allocations, totalDeposits, contracts) {
  let portfolioVariance = 0;
  let totalYield = 0;
  let totalAllocated = 0;
  let concentrationSum = 0;
  let liquiditySum = 0;

  const assets = Object.keys(allocations);
  if (assets.length === 0 || totalDeposits === 0) {
    return {
      sharpeRatio: 0,
      valueAtRisk: 0,
      diversificationScore: 0,
      liquidityScore: 0,
      healthScore: 0,
      avgYield: 0
    };
  }

  // Volatility covariance calculation (simple cross correlation ρ = 0.15)
  const correlation = 0.15;

  assets.forEach(assetId => {
    const allocation = parseFloat(allocations[assetId]) || 0;
    totalAllocated += allocation;

    const contract = contracts[assetId];
    if (contract) {
      const yieldRate = (contract.yieldRate || 0) / 10000; // e.g. 720 basis points = 0.072
      totalYield += yieldRate * allocation;

      const vol = RISK_VOLATILITIES[contract.riskRating] || 0.1;
      const weight = totalDeposits > 0 ? (allocation / totalDeposits) : 0;

      portfolioVariance += Math.pow(weight * vol, 2);
      concentrationSum += Math.pow(weight, 2);

      const liq = LIQUIDITY_WEIGHTS[assetId] || 0.50;
      liquiditySum += liq * weight;
    }
  });

  // Cross variance term
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      const contractI = contracts[assets[i]];
      const contractJ = contracts[assets[j]];
      if (contractI && contractJ) {
        const wI = (parseFloat(allocations[assets[i]]) || 0) / totalDeposits;
        const wJ = (parseFloat(allocations[assets[j]]) || 0) / totalDeposits;
        const volI = RISK_VOLATILITIES[contractI.riskRating] || 0.1;
        const volJ = RISK_VOLATILITIES[contractJ.riskRating] || 0.1;
        portfolioVariance += 2 * wI * wJ * volI * volJ * correlation;
      }
    }
  }

  const portfolioVol = Math.sqrt(portfolioVariance);

  // 1-day 95% Value at Risk (VaR) = 1.645 * Volatility * Portfolio Size
  const valueAtRisk = totalDeposits * (1.645 * portfolioVol);

  // Avg yield rate in percent
  const avgYield = totalAllocated > 0 ? (totalYield / totalAllocated) : 0;

  // Annualized Sharpe Ratio = (Portfolio APY - Risk-Free Rate) / Portfolio Volatility
  const riskFreeRate = 4.5; // US Treasury standard
  const portfolioApy = avgYield * 100; // percentage
  const Sharpe = portfolioVol > 0 ? (portfolioApy - riskFreeRate) / (portfolioVol * 100) : 0;

  // Diversification Score = (1 - HHI) / (1 - 1/N) as a percentage index
  const HHI = concentrationSum;
  const N = assets.length;
  let diversification = 100;
  if (N > 1) {
    diversification = ((1.0 - HHI) / (1.0 - (1 / N))) * 100;
  }

  // Liquidity score percentage
  const liquidityScore = liquiditySum * 100;

  // Composite Health Score
  const normSharpe = Math.min(100, Math.max(0, (Sharpe / 3.0) * 100)); // target Sharpe 3.0
  const normVaR = Math.max(0, 100 - (valueAtRisk / totalDeposits) * 500); // penalized for VaR > 20%
  const compositeHealth = Math.round(
    (normSharpe * 0.3) +
    (normVaR * 0.2) +
    (diversification * 0.3) +
    (liquidityScore * 0.2)
  );

  return {
    sharpeRatio: parseFloat(Sharpe.toFixed(2)),
    valueAtRisk: Math.round(valueAtRisk),
    diversificationScore: Math.round(diversification),
    liquidityScore: Math.round(liquidityScore),
    healthScore: compositeHealth,
    avgYield: parseFloat((avgYield * 100).toFixed(2))
  };
}
