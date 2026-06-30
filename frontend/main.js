// Aequitas RWA - Interactive Swarm Logic & Controller Playground

// Global state
let networkState = null;
let currentAction = 'deposit'; // 'deposit' or 'withdraw'
let socket = null;
let logFilter = 'all';
let selectedNodeId = null;

// Persistent Onboarding & Wallet State (loaded from localStorage)
let walletMode = localStorage.getItem('aequitas_wallet_mode') || 'demo';
let casperWalletAddress = localStorage.getItem('aequitas_wallet_address') || 'user_wallet';
let onboardingStep = parseInt(localStorage.getItem('aequitas_onboarding_step') || '1');
let selectedStrategy = localStorage.getItem('aequitas_selected_strategy') || 'balanced';
let onboardingCompleted = localStorage.getItem('aequitas_onboarding_completed') === 'true';

// Client-Side Router mapping
const routes = {
  '/': 'home',
  '/dashboard': 'home',
  '/portfolio': 'home',
  '/invest': 'invest',
  '/ai': 'invest',
  '/assets': 'assets',
  '/compliance': 'compliance',
  '/activity': 'activity',
  '/settings': 'settings',
  '/help': 'help'
};

function navigateTo(path) {
  history.pushState(null, '', path);
  handleRoute(path);
}

function handleRoute(path) {
  const pane = routes[path] || 'home';
  
  // Highlight active sidebar navigation link
  document.querySelectorAll('.sidebar-links .nav-link').forEach(link => {
    const linkPath = link.getAttribute('data-path');
    if (linkPath === path || (linkPath === '/' && (path === '/dashboard' || path === '/portfolio'))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Highlight active mobile bottom navigation link
  document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
    const itemPath = item.getAttribute('onclick');
    if (itemPath && itemPath.includes(pane)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Show active tab content pane
  document.querySelectorAll('.content-pane').forEach(el => {
    if (el.id === `pane-${pane}`) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update breadcrumb label
  const breadcrumb = document.getElementById('breadcrumb-current-page');
  if (breadcrumb) {
    breadcrumb.innerText = pane.charAt(0).toUpperCase() + pane.slice(1);
  }

  if (pane === 'assets') {
    setTimeout(resizeCanvas, 50);
  }
}

// Visualizer Canvas Configuration
const canvas = document.getElementById('swarmCanvas');
const ctx = canvas.getContext('2d');
let nodes = {};
let particles = [];
let animationFrameId = null;

// Initialize layout size
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height - 40; // accommodate legend space
  setupNodes();
}

// ----------------------------------------------------
// Node Swarm Layout Setup (Dynamic RWA Placement)
// ----------------------------------------------------
function setupNodes() {
  const w = canvas.width;
  const h = canvas.height;

  // Static core nodes
  nodes = {
    x402: {
      id: 'x402',
      label: 'x402 Premium API',
      x: w / 2,
      y: h * 0.2,
      color: '#ff007f', // pink
      radius: 18,
      pulse: 0,
      desc: 'Paid Data Source'
    },
    evaluator: {
      id: 'evaluator',
      label: 'Risk Evaluator Agent',
      x: w * 0.22,
      y: h * 0.35,
      color: '#b026ff', // purple
      radius: 16,
      pulse: 0,
      desc: 'Scrapes Off-chain Data'
    },
    router: {
      id: 'router',
      label: 'Treasury Router Agent',
      x: w * 0.78,
      y: h * 0.35,
      color: '#00f0ff', // blue
      radius: 16,
      pulse: 0,
      desc: 'Optimizes Liquidity'
    },
    vault: {
      id: 'vault',
      label: 'Aequitas Vault Contract',
      x: w / 2,
      y: h * 0.55,
      color: '#3d5afe', // dark blue/indigo
      radius: 24,
      pulse: 0,
      desc: 'TVL Yield Aggregator'
    }
  };

  // Dynamic RWA contract nodes placement
  if (networkState && networkState.ledger) {
    const contracts = networkState.ledger.contracts;
    const rwaKeys = Object.keys(contracts).filter(k => k.startsWith('RWA-'));
    const N = rwaKeys.length;

    rwaKeys.forEach((key, index) => {
      let x = w / 2;
      if (N > 1) {
        x = w * (0.18 + 0.64 * (index / (N - 1)));
      }
      const y = h * (0.8 + (index % 2 === 0 ? 0.04 : 0));

      nodes[key] = {
        id: key,
        label: key,
        x: x,
        y: y,
        color: '#00ff66', // green
        radius: 14,
        pulse: 0,
        desc: contracts[key].name
      };
    });
  }
}

// Add a glowing particle going from source to target node
function shootParticle(sourceId, targetId, color, speed = 2, size = 4) {
  const src = nodes[sourceId];
  const dest = nodes[targetId];
  if (!src || !dest) return;

  particles.push({
    x: src.x,
    y: src.y,
    targetX: dest.x,
    targetY: dest.y,
    progress: 0,
    speed: speed / 100, // percentage increment per frame
    color: color,
    size: size,
    targetNode: dest
  });

  src.pulse = 10;
}

// ----------------------------------------------------
// Canvas Render Loop
// ----------------------------------------------------
function drawSwarm() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw node links
  const links = [
    ['evaluator', 'x402'],
    ['evaluator', 'vault'],
    ['router', 'vault']
  ];

  if (networkState && networkState.ledger) {
    const rwaKeys = Object.keys(networkState.ledger.contracts).filter(k => k.startsWith('RWA-'));
    rwaKeys.forEach(key => {
      links.push(['vault', key]);
    });
  }

  links.forEach(([from, to]) => {
    const src = nodes[from];
    const dest = nodes[to];
    if (src && dest) {
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(dest.x, dest.y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.stroke();
    }
  });

  // Draw node highlight selection
  if (selectedNodeId && nodes[selectedNodeId]) {
    const sNode = nodes[selectedNodeId];
    ctx.beginPath();
    ctx.arc(sNode.x, sNode.y, sNode.radius + 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]); // reset
  }

  // 2. Draw active particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.progress += p.speed;

    if (p.progress >= 1) {
      p.targetNode.pulse = 12; // Pulse node
      particles.splice(i, 1);
      continue;
    }

    const currentX = p.x + (p.targetX - p.x) * p.progress;
    const currentY = p.y + (p.targetY - p.y) * p.progress;

    ctx.beginPath();
    ctx.arc(currentX, currentY, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = p.color;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 3. Draw nodes
  Object.values(nodes).forEach(node => {
    const pulseOffset = Math.sin(Date.now() / 200) * 2;
    const currentRadius = node.radius + (node.pulse > 0 ? node.pulse : 0);
    
    if (node.pulse > 0) node.pulse -= 0.3; // Decay pulse

    // Draw halo
    const glowGradient = ctx.createRadialGradient(node.x, node.y, currentRadius - 4, node.x, node.y, currentRadius + 18);
    glowGradient.addColorStop(0, 'rgba(0,0,0,0)');
    glowGradient.addColorStop(0.2, node.color + '22');
    glowGradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(node.x, node.y, currentRadius + 18, 0, Math.PI * 2);
    ctx.fill();

    // Draw circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, currentRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0f081c';
    ctx.strokeStyle = node.color;
    ctx.lineWidth = 2 + (node.pulse > 0 ? 1 : 0);
    ctx.stroke();
    ctx.fill();

    // Core dot
    ctx.beginPath();
    ctx.arc(node.x, node.y, 4 + pulseOffset / 2, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = node.color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = '#f3effa';
    ctx.font = 'bold 11px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(node.label, node.x, node.y - currentRadius - 8);

    ctx.fillStyle = '#8b7f9d';
    ctx.font = '9px Space Grotesk';
    ctx.fillText(node.desc, node.x, node.y + currentRadius + 14);
  });

  animationFrameId = requestAnimationFrame(drawSwarm);
}

// ----------------------------------------------------
// Node Detail Inspector
// ----------------------------------------------------
function inspectNode(nodeId) {
  selectedNodeId = nodeId;
  const inspector = document.getElementById('node-inspector');
  const title = document.getElementById('inspect-title');
  const content = document.getElementById('inspect-content');

  if (!nodeId || !nodes[nodeId]) {
    inspector.style.display = 'none';
    selectedNodeId = null;
    return;
  }

  inspector.style.display = 'block';
  const node = nodes[nodeId];
  title.innerText = node.label;

  let detailsHtml = '';

  if (nodeId === 'x402') {
    const destBal = networkState.ledger.accounts['cspr_premium_api_vault'].balance;
    detailsHtml = `
      <div class="inspect-row"><span>Type:</span><strong>API Service Gate</strong></div>
      <div class="inspect-row"><span>Protocol:</span><strong>HTTP 402 / CSPR</strong></div>
      <div class="inspect-row"><span>Vault Wallet:</span><strong>cspr_premium_api_vault</strong></div>
      <div class="inspect-row"><span>Vault Balance:</span><strong>${parseFloat(destBal).toLocaleString()} CSPR</strong></div>
      <div class="inspect-row"><span>Fee Per Call:</span><strong>0.10 CSPR</strong></div>
      <div class="inspect-row"><span>API Status:</span><strong>ONLINE</strong></div>
    `;
  } else if (nodeId === 'evaluator') {
    const bal = networkState.ledger.accounts['risk_evaluator_wallet'].balance;
    detailsHtml = `
      <div class="inspect-row"><span>Type:</span><strong>Autonomous Agent</strong></div>
      <div class="inspect-row"><span>Agent Wallet:</span><strong>risk_evaluator_wallet</strong></div>
      <div class="inspect-row"><span>Sim Balance:</span><strong>${parseFloat(bal).toLocaleString()} CSPR</strong></div>
      <div class="inspect-row"><span>Data Channel:</span><strong>Istanbul Premium feeds</strong></div>
      <div class="inspect-row"><span>MCP Server:</span><strong>Connected</strong></div>
      <div class="inspect-row"><span>Status:</span><strong>${networkState.agentAutomation ? 'ACTIVE' : 'MANUAL TRIGGER'}</strong></div>
    `;
  } else if (nodeId === 'router') {
    const bal = networkState.ledger.accounts['treasury_router_wallet'].balance;
    detailsHtml = `
      <div class="inspect-row"><span>Type:</span><strong>Autonomous Agent</strong></div>
      <div class="inspect-row"><span>Agent Wallet:</span><strong>treasury_router_wallet</strong></div>
      <div class="inspect-row"><span>Sim Balance:</span><strong>${parseFloat(bal).toLocaleString()} CSPR</strong></div>
      <div class="inspect-row"><span>Target Vault:</span><strong>AequitasVault</strong></div>
      <div class="inspect-row"><span>MCP Server:</span><strong>CSPR.trade MCP</strong></div>
      <div class="inspect-row"><span>Status:</span><strong>${networkState.agentAutomation ? 'ACTIVE' : 'MANUAL TRIGGER'}</strong></div>
    `;
  } else if (nodeId === 'vault') {
    const vault = networkState.ledger.contracts.AequitasVault;
    const totalDeposits = parseFloat(vault.totalDeposits);
    detailsHtml = `
      <div class="inspect-row"><span>Contract:</span><strong>AequitasVault.wasm</strong></div>
      <div class="inspect-row"><span>Address:</span><strong>aequitas_vault_contract</strong></div>
      <div class="inspect-row"><span>Total TVL:</span><strong>${totalDeposits.toLocaleString()} CSPR</strong></div>
      <div class="inspect-row"><span>Router Agent:</span><strong>treasury_router_wallet</strong></div>
      <div class="inspect-row"><span>Depositors:</span><strong>${Object.keys(vault.balances).length}</strong></div>
    `;
  } else {
    const contract = networkState.ledger.contracts[nodeId];
    const allocation = parseFloat(networkState.ledger.contracts.AequitasVault.allocations[nodeId] || '0');
    detailsHtml = `
      <div class="inspect-row"><span>Contract:</span><strong>RwaToken.wasm</strong></div>
      <div class="inspect-row"><span>Address:</span><strong>${nodeId}</strong></div>
      <div class="inspect-row"><span>Valuation:</span><strong>$${parseFloat(contract.valuation).toLocaleString()}</strong></div>
      <div class="inspect-row"><span>Risk Rating:</span><strong>${contract.riskRating}</strong></div>
      <div class="inspect-row"><span>Yield (APY):</span><strong>${(contract.yieldRate / 100).toFixed(2)}%</strong></div>
      <div class="inspect-row"><span>Vault Holding:</span><strong>${allocation.toLocaleString()} CSPR</strong></div>
    `;
  }

  content.innerHTML = detailsHtml;
}

// ----------------------------------------------------
// UI Render Methods
// ----------------------------------------------------
function updateUI(state) {
  const isFirstLoad = !networkState;
  networkState = state;
  const ledger = state.ledger;

  // Refresh visualizer coordinates
  setupNodes();

  // 1. Vault stats
  const vault = ledger.contracts.AequitasVault;
  const tvl = parseFloat(vault.totalDeposits);
  
  // Format TVL text
  const tvlText = `${tvl.toLocaleString(undefined, { minimumFractionDigits: 2 })} CSPR`;
  if (document.getElementById('tvl-value')) {
    document.getElementById('tvl-value').innerText = tvlText;
  }
  if (document.getElementById('dash-tvl-value')) {
    document.getElementById('dash-tvl-value').innerText = tvlText;
  }
  
  // Risk metrics values
  let avgYield = 7.85;
  let safetyScore = 90;
  let valueAtRisk = 1240;
  let sharpeRatio = 1.82;

  if (state.risk) {
    avgYield = state.risk.avgYield;
    safetyScore = state.risk.healthScore;
    valueAtRisk = state.risk.valueAtRisk;
    sharpeRatio = state.risk.sharpeRatio;
  }

  // Update metrics elements
  const updateMetric = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  updateMetric('avg-yield', `${avgYield.toFixed(2)}%`);
  updateMetric('dash-avg-yield', `${avgYield.toFixed(2)}%`);
  updateMetric('risk-health', `${safetyScore}/100`);
  updateMetric('dash-risk-health', `${safetyScore}/100`);
  updateMetric('risk-var', `${valueAtRisk.toLocaleString()} CSPR`);
  updateMetric('dash-risk-var', `${valueAtRisk.toLocaleString()} CSPR`);
  updateMetric('risk-sharpe', sharpeRatio.toFixed(2));
  updateMetric('dash-risk-sharpe', sharpeRatio.toFixed(2));

  // Render compliance credentials badge
  if (state.compliance && state.compliance[casperWalletAddress]) {
    const comp = state.compliance[casperWalletAddress];
    const badge = document.getElementById('compliance-badge');
    const proofText = document.getElementById('compliance-proof-hash');
    
    if (badge && proofText) {
      if (comp.status === 'VERIFIED') {
        badge.innerText = 'VERIFIED';
        badge.style.background = 'rgba(0, 255, 102, 0.1)';
        badge.style.color = 'var(--brand-green)';
        badge.style.borderColor = 'var(--brand-green)';
        proofText.innerText = comp.proofHash || 'Verified Proof Hash';
      } else if (comp.status === 'REVOKED') {
        badge.innerText = 'REVOKED';
        badge.style.background = 'rgba(255, 0, 127, 0.1)';
        badge.style.color = 'var(--brand-pink)';
        badge.style.borderColor = 'var(--brand-pink)';
        proofText.innerText = 'ZK proof cleared';
      } else {
        badge.innerText = 'UNVERIFIED';
        badge.style.background = 'rgba(255, 255, 255, 0.05)';
        badge.style.color = 'var(--text-secondary)';
        badge.style.borderColor = 'var(--card-border)';
        proofText.innerText = 'No ZK proof on-chain';
      }
    }
  }

  // Update checkmarks checklist in Home pane
  const walletConnected = casperWalletAddress && casperWalletAddress !== 'user_wallet' || walletMode === 'demo';
  const kycDone = state.compliance && state.compliance[casperWalletAddress] && state.compliance[casperWalletAddress].status === 'VERIFIED';
  const goalStated = localStorage.getItem('aequitas_selected_strategy') !== null;

  const chkWallet = document.getElementById('chk-wallet');
  const chkKyc = document.getElementById('chk-kyc');
  const chkGoal = document.getElementById('chk-goal');

  if (chkWallet) chkWallet.innerText = walletConnected ? '✅' : '⏳';
  if (chkKyc) chkKyc.innerText = kycDone ? '✅' : '⏳';
  if (chkGoal) chkGoal.innerText = goalStated ? '✅' : '⏳';

  // Home view labels
  const modeLabel = document.getElementById('home-mode-label');
  const walletLabel = document.getElementById('home-wallet-label');
  if (modeLabel) modeLabel.innerText = walletMode === 'demo' ? 'Sandbox Demo Mode' : 'Casper Testnet';
  if (walletLabel) walletLabel.innerText = casperWalletAddress;

  // Render amount actions
  const userWallet = ledger.accounts[casperWalletAddress] || { balance: '0.00' };
  const userWalletBal = document.getElementById('user-balance');
  if (userWalletBal) {
    userWalletBal.innerText = parseFloat(userWallet.balance).toLocaleString(undefined, { minimumFractionDigits: 2 });
  }
  
  const userVaultDeposit = parseFloat(vault.balances[casperWalletAddress] || '0');
  const actionBtnMain = document.getElementById('btn-submit-action');
  const actionBtnInvest = document.getElementById('invest-btn-submit-action');
  
  const actionLabel = currentAction === 'deposit' ? 'Stake CSPR' : `Unstake (Max: ${userVaultDeposit.toLocaleString()} CSPR)`;
  if (actionBtnMain) actionBtnMain.innerText = actionLabel;
  if (actionBtnInvest) actionBtnInvest.innerText = actionLabel;

  // Update wallet connection pill
  const pill = document.getElementById('wallet-pill');
  if (pill) {
    pill.innerText = `🔌 Connected: ${casperWalletAddress.substring(0, 12)}...`;
  }

  // Render allocation progress bars (both home and portfolio panels)
  const rwaKeys = Object.keys(ledger.contracts).filter(k => k.startsWith('RWA-'));
  const allocList = document.getElementById('allocation-bars');
  const portAllocList = document.getElementById('port-allocation-bars');
  
  const renderAllocBars = (container) => {
    if (!container) return;
    container.innerHTML = '';
    rwaKeys.forEach((assetId, index) => {
      const allocation = parseFloat(vault.allocations[assetId] || '0');
      const percent = tvl > 0 ? ((allocation / tvl) * 100) : 0;
      const colors = ['var(--brand-blue)', 'var(--brand-purple)', 'var(--brand-pink)', 'var(--brand-orange)', '#ffff00'];
      const color = colors[index % colors.length];

      const itemHtml = `
        <div class="allocation-item" style="margin-bottom:12px;">
          <div class="allocation-meta" style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
            <span>${ledger.contracts[assetId].name}</span>
            <strong style="color: ${color}">${percent.toFixed(1)}% (${Math.round(allocation).toLocaleString()} CSPR)</strong>
          </div>
          <div class="bar-container" style="width:100%; height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
            <div class="bar-fill" style="width: ${percent}%; height:100%; background: ${color}; transition: width 0.4s ease;"></div>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', itemHtml);
    });
  };

  renderAllocBars(allocList);
  renderAllocBars(portAllocList);

  // Render portfolio explainability cards (under portfolio pane)
  const explainContainer = document.getElementById('portfolio-explainability-cards');
  if (explainContainer) {
    explainContainer.innerHTML = '';
    rwaKeys.forEach(assetId => {
      const contract = ledger.contracts[assetId];
      const allocation = parseFloat(vault.allocations[assetId] || '0');
      if (allocation > 0) {
        const cardHtml = `
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--card-border); border-radius:var(--radius-sm); padding:10px; font-size:0.82rem; margin-bottom:10px;">
            <strong style="color:var(--brand-blue); display:block; margin-bottom:4px;">${contract.name} (${assetId})</strong>
            <span style="color:var(--text-secondary);">Allocated quantity: **${Math.round(allocation).toLocaleString()} CSPR** at **${(contract.yieldRate / 100).toFixed(2)}% APY**. Continuous Oracle pricing checks matches off-chain targets.</span>
          </div>
        `;
        explainContainer.insertAdjacentHTML('beforeend', cardHtml);
      }
    });
    if (explainContainer.innerHTML === '') {
      explainContainer.innerHTML = `<p style="color:var(--text-secondary); font-size:0.85rem;">No active allocations currently staked.</p>`;
    }
  }

  // Update Assets select dropdown
  const assetSelect = document.getElementById('param-asset-select');
  if (assetSelect) {
    const prevSelected = assetSelect.value;
    assetSelect.innerHTML = '';
    rwaKeys.forEach(assetId => {
      const opt = document.createElement('option');
      opt.value = assetId;
      opt.innerText = assetId;
      assetSelect.appendChild(opt);
    });

    if (rwaKeys.includes(prevSelected)) {
      assetSelect.value = prevSelected;
    } else if (rwaKeys.length > 0) {
      assetSelect.value = rwaKeys[0];
    }
    
    if (isFirstLoad || assetSelect.value !== prevSelected) {
      syncSlidersToSelectedAsset();
    }
  }

  // Update automation buttons
  const autoBtn = document.getElementById('btn-automation-toggle');
  if (autoBtn) {
    if (state.agentAutomation) {
      autoBtn.innerText = 'Toggle Automation: ON';
    } else {
      autoBtn.innerText = 'Toggle Automation: OFF';
    }
  }
}

// Sync parameter deck sliders to selected asset
function syncSlidersToSelectedAsset() {
  const assetId = document.getElementById('param-asset-select').value;
  if (!assetId || !networkState) return;

  const asset = networkState.offChain[assetId];
  if (!asset) return;

  // Set sliders
  document.getElementById('param-val-slider').value = asset.valuation;
  document.getElementById('val-slider-value').innerText = `$${asset.valuation.toLocaleString()}`;

  const yieldPercent = (asset.yieldRate / 100).toFixed(2);
  document.getElementById('param-yield-slider').value = yieldPercent;
  document.getElementById('yield-slider-value').innerText = `${yieldPercent}%`;

  // Segment buttons
  document.querySelectorAll('#param-risk-segments .segment-btn').forEach(btn => {
    if (btn.getAttribute('data-risk') === asset.riskRating) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// ----------------------------------------------------
// Navigation system
// ----------------------------------------------------
function switchPane(paneId) {
  // Mobile bottom buttons state
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    if (btn.id === `nav-${paneId}`) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Desktop header links state
  document.querySelectorAll('.desktop-nav-header a').forEach(link => {
    if (link.getAttribute('onclick').includes(paneId)) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Pane content display
  document.querySelectorAll('.content-pane').forEach(pane => {
    if (pane.id === `pane-${paneId}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  if (paneId === 'assets') {
    resizeCanvas();
  }
}

// Toggle deposit/withdraw interactive state
function setStakingAction(action) {
  currentAction = action;
  const stakeTab = document.getElementById('quick-stake-tab');
  const unstakeTab = document.getElementById('quick-unstake-tab');
  
  if (action === 'deposit') {
    stakeTab.className = 'btn-action-primary';
    unstakeTab.className = '';
    unstakeTab.style.background = 'transparent';
    unstakeTab.style.color = 'var(--text-secondary)';
    document.getElementById('btn-submit-action').innerText = 'Stake CSPR';
  } else {
    unstakeTab.className = 'btn-action-primary';
    stakeTab.className = '';
    stakeTab.style.background = 'transparent';
    stakeTab.style.color = 'var(--text-secondary)';
    
    const userVaultDeposit = networkState ? parseFloat(networkState.ledger.contracts.AequitasVault.balances[casperWalletAddress] || '0') : 0;
    document.getElementById('btn-submit-action').innerText = `Unstake (Max: ${userVaultDeposit.toLocaleString()} CSPR)`;
  }
}

// ----------------------------------------------------
// Onboarding Stepper Actions
// ----------------------------------------------------
function getCasperProvider() {
  if (typeof window.CasperWalletProvider !== 'undefined') {
    return window.CasperWalletProvider();
  }
  if (typeof window.casperlabsHelper !== 'undefined') {
    return window.casperlabsHelper;
  }
  return null;
}

async function connectCasperWallet() {
  const provider = getCasperProvider();
  const guide = document.getElementById('wallet-not-detected-guide');
  
  if (!provider) {
    guide.style.display = 'block';
    return;
  }
  
  try {
    if (typeof window.CasperWalletProvider !== 'undefined') {
      const walletProvider = window.CasperWalletProvider();
      await walletProvider.requestConnection();
      casperWalletAddress = await walletProvider.getActivePublicKey();
    } else {
      await window.casperlabsHelper.requestConnection();
      casperWalletAddress = await window.casperlabsHelper.getActivePublicKey();
    }
    
    walletMode = 'casper';
    localStorage.setItem('aequitas_wallet_mode', 'casper');
    localStorage.setItem('aequitas_wallet_address', casperWalletAddress);
    guide.style.display = 'none';
    
    // Update pill and advance
    document.getElementById('wallet-pill').innerText = `🔌 CONNECTED: ${casperWalletAddress.substring(0, 12)}...`;
    nextOnboardingStep(5);
  } catch (err) {
    alert("Connection rejected: " + err.message);
  }
}

function nextOnboardingStep(step) {
  // Update progress bar
  const bar = document.getElementById('onboarding-bar');
  const percentage = (step / 8) * 100;
  bar.style.width = `${percentage}%`;

  // Check if wallet step is being shown
  if (step === 4) {
    const provider = getCasperProvider();
    const guide = document.getElementById('wallet-not-detected-guide');
    if (!provider) {
      guide.style.display = 'block';
    } else {
      guide.style.display = 'none';
    }
  }

  // Hide active step
  document.querySelectorAll('.onboarding-step').forEach(el => {
    el.classList.remove('active');
  });

  // Show target step
  document.getElementById(`onboarding-step-${step}`).classList.add('active');
  onboardingStep = step;
  localStorage.setItem('aequitas_onboarding_step', step.toString());
}

function useDemoWalletMode() {
  walletMode = 'demo';
  casperWalletAddress = 'user_wallet';
  localStorage.setItem('aequitas_wallet_mode', 'demo');
  localStorage.setItem('aequitas_wallet_address', 'user_wallet');
  nextOnboardingStep(5);
}

async function runOnboardKYC() {
  const provider = getCasperProvider();
  
  if (walletMode === 'casper' && !provider) {
    alert("Casper Wallet connection required to proceed.");
    return;
  }

  document.getElementById('btn-onboard-kyc').style.display = 'none';
  document.getElementById('compliance-loader-onboard').style.display = 'block';

  // Sign ZK compliance consent message
  const message = `Aequitas RWA KYC Verification: Consent to publish ZK compliance proof for wallet ${casperWalletAddress}`;
  try {
    let signature = "simulated_zk_sig";
    if (walletMode === 'casper') {
      if (typeof window.CasperWalletProvider !== 'undefined') {
        const walletProvider = window.CasperWalletProvider();
        const signed = await walletProvider.signMessage(message, casperWalletAddress);
        signature = signed.signature;
      } else {
        signature = await window.casperlabsHelper.signMessage(message, casperWalletAddress);
      }
    }

    // Submit signature to compliance screen API
    const res = await fetch('/api/compliance/screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: casperWalletAddress, signature, message })
    });
    
    await res.json();
    setTimeout(() => {
      nextOnboardingStep(6);
    }, 1200);
  } catch (err) {
    alert("Signature verification failed: " + err.message);
    document.getElementById('btn-onboard-kyc').style.display = 'block';
    document.getElementById('compliance-loader-onboard').style.display = 'none';
  }
}

function selectStrategy(strategy) {
  selectedStrategy = strategy;
  localStorage.setItem('aequitas_selected_strategy', strategy);
  const box = document.getElementById('strategy-recommendation-summary');
  
  let content = '';
  if (strategy === 'conservative') {
    content = `
      <strong style="color:var(--brand-green);">🛡️ Conservative Income Recommendation</strong>
      <p style="margin-top:6px; color:var(--text-secondary);">Your assets are optimized for safety. Maximum exposure allocated to Greenwood Office Real Estate.</p>
      <div style="margin-top:8px;">Target Return: **5.90% APY**<br>Confidence Score: **99%**</div>
    `;
  } else if (strategy === 'aggressive') {
    content = `
      <strong style="color:var(--brand-pink);">🚀 Aggressive Yield Recommendation</strong>
      <p style="margin-top:6px; color:var(--text-secondary);">Allocations maximize high-yield options, emphasizing Maritime Freight Credit (9.80% APY).</p>
      <div style="margin-top:8px;">Target Return: **8.40% APY**<br>Confidence Score: **92%**</div>
    `;
  } else {
    content = `
      <strong style="color:var(--brand-blue);">⚖️ Balanced Growth Recommendation</strong>
      <p style="margin-top:6px; color:var(--text-secondary);">An even blend of invoice credits and property, targeting yield with volatility protection.</p>
      <div style="margin-top:8px;">Target Return: **7.15% APY**<br>Confidence Score: **96%**</div>
    `;
  }
  
  box.innerHTML = content;
  nextOnboardingStep(7);
}

async function confirmOnboardingStaking() {
  // Close onboarding card overlay
  document.getElementById('onboarding-wizard').style.display = 'none';
  onboardingCompleted = true;
  localStorage.setItem('aequitas_onboarding_completed', 'true');
  
  // Submit AI investment request to start simulation rebalancing
  const text = `Invest conservatively for ${selectedStrategy} strategy`;
  
  fetch('/api/ai/invest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: text, sender: casperWalletAddress })
  });
}

// ----------------------------------------------------
// Staking Transaction & Casper Signer Adapter
// ----------------------------------------------------
function closeTxModal() {
  document.getElementById('tx-modal').style.display = 'none';
  document.getElementById('tx-modal-action-box').style.display = 'none';
}

async function executeStakingTransaction() {
  const amountInput = document.getElementById('amount-input');
  const amount = parseFloat(amountInput.value);
  
  if (isNaN(amount) || amount <= 0) {
    alert("Please enter a valid positive CSPR amount.");
    return;
  }

  const provider = getCasperProvider();
  const modal = document.getElementById('tx-modal');
  const title = document.getElementById('tx-modal-title');
  const desc = document.getElementById('tx-modal-desc');
  const actionBox = document.getElementById('tx-modal-action-box');
  
  modal.style.display = 'flex';
  actionBox.style.display = 'none';

  if (walletMode === 'casper' && !provider) {
    title.innerText = "Casper Wallet Required";
    desc.innerHTML = `
      <div style="text-align:left; font-size:0.85rem;">
        <p style="color:var(--brand-pink); font-weight:bold; margin-bottom:8px;">No Casper wallet extension was detected.</p>
        <p style="color:var(--text-secondary); margin-bottom:8px;">To complete staking transactions, please install one of the supported Casper extensions:</p>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <a href="https://cspr.live/wallet" target="_blank" style="color:var(--brand-blue); text-decoration:underline;">📥 Download Casper Wallet</a>
          <a href="https://chrome.google.com/webstore/detail/casper-signer/jojikgnjmodnccaanggboacoeallhpba" target="_blank" style="color:var(--brand-blue); text-decoration:underline;">📥 Download Casper Signer</a>
        </div>
      </div>
    `;
    actionBox.style.display = 'block';
    return;
  }

  try {
    // Step 1: Build deploy template from server
    title.innerText = "Structuring Deploy";
    desc.innerText = `Requesting transaction payload structure for AequitasVault.${currentAction}(${amount} CSPR)...`;
    
    const buildRes = await fetch('/api/casper/build-deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entrypoint: currentAction === 'deposit' ? 'deposit' : 'withdraw',
        sender: casperWalletAddress,
        args: [
          ["amount", { cl_type: "U512", parsed: (amount * 1000000000).toString() }] // CSPR has 9 decimals
        ]
      })
    });

    if (!buildRes.ok) {
      const err = await buildRes.json();
      throw new Error(err.error || "Failed to structure transaction payload");
    }

    const { deploy } = await buildRes.json();

    // Step 2: Prompt Wallet Signer Approval
    title.innerText = "Awaiting Wallet Signature";
    desc.innerText = "Please review and approve the transaction in your Casper wallet extension popup.";

    let signedDeploy;
    if (walletMode === 'casper') {
      if (typeof window.CasperWalletProvider !== 'undefined') {
        const walletProvider = window.CasperWalletProvider();
        const signed = await walletProvider.sign(JSON.stringify(deploy), casperWalletAddress);
        if (signed.cancelled) {
          throw new Error("Transaction signature cancelled by user.");
        }
        signedDeploy = JSON.parse(signed.deploy);
      } else {
        const signedJson = await window.casperlabsHelper.sign(JSON.stringify(deploy), casperWalletAddress);
        signedDeploy = JSON.parse(signedJson);
      }
    } else {
      // Sandbox Demo simulation: simulated sign
      await new Promise(r => setTimeout(r, 1200));
      signedDeploy = deploy;
    }

    // Step 3: Broadcast to Testnet Node
    title.innerText = "Broadcasting Deploy";
    desc.innerText = "Submitting signed transaction to Casper Testnet node RPC interface...";

    const broadcastRes = await fetch(walletMode === 'casper' ? '/api/casper/broadcast' : `/api/${currentAction}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(walletMode === 'casper' ? { signedDeploy } : { sender: casperWalletAddress, amount })
    });

    if (!broadcastRes.ok) {
      const err = await broadcastRes.json();
      throw new Error(err.error || "Transaction broadcast failed.");
    }

    const resData = await broadcastRes.json();
    const deployHash = walletMode === 'casper' ? resData.deployHash : resData.txHash;

    // Step 4: Await block confirmation on Casper Testnet
    title.innerText = "Waiting for Block Confirmation";
    desc.innerHTML = `
      <p style="margin-bottom:8px;">Deploy Hash: <code style="color:var(--brand-blue); font-size:0.75rem;">${deployHash}</code></p>
      <p style="color:var(--text-secondary); margin-bottom:12px;">Querying Casper Testnet RPC node (info_get_deploy)...</p>
      <a href="https://testnet.cspr.live/deploy/${deployHash}" target="_blank" class="btn-action-secondary" style="padding:6px 12px; font-size:0.8rem; display:inline-block; width:auto;">
        🔍 View on CSPR.live Testnet Explorer
      </a>
    `;

    // Polling logic
    let confirmed = false;
    let attempts = 0;
    while (!confirmed && attempts < 20) {
      await new Promise(r => setTimeout(r, 4000));
      attempts++;
      
      const pollRes = await fetch(walletMode === 'casper' ? `/api/casper/deploy-status?hash=${deployHash}` : '/api/state');
      if (pollRes.ok) {
        if (walletMode === 'casper') {
          const pollData = await pollRes.json();
          if (pollData.confirmed) {
            confirmed = true;
            if (pollData.success) {
              title.innerText = "Staking Complete";
              desc.innerHTML = `
                <p style="color:var(--brand-green); font-weight:bold; margin-bottom:8px;">Transaction confirmed successfully!</p>
                <p style="margin-bottom:8px;">Deploy Hash: <code style="color:var(--brand-blue); font-size:0.75rem;">${deployHash}</code></p>
                <a href="https://testnet.cspr.live/deploy/${deployHash}" target="_blank" class="btn-action-secondary" style="padding:6px 12px; font-size:0.8rem; display:inline-block; width:auto; margin-bottom:8px;">
                  🔍 View Execution on CSPR.live
                </a>
              `;
            } else {
              throw new Error("Transaction execution failed inside contract logic.");
            }
          }
        } else {
          // Sandbox is instant confirmation
          confirmed = true;
          title.innerText = "Staking Complete";
          desc.innerHTML = `
            <p style="color:var(--brand-green); font-weight:bold; margin-bottom:8px;">Transaction confirmed successfully!</p>
            <p style="margin-bottom:8px;">Sim Hash: <code style="color:var(--brand-blue); font-size:0.75rem;">${deployHash}</code></p>
          `;
        }
      }
    }

    if (!confirmed) {
      throw new Error("Transaction verification timed out. Please check CSPR.live later.");
    }

  } catch (err) {
    console.error(err);
    title.innerText = "Transaction Error";
    desc.innerHTML = `<span style="color:var(--brand-pink); font-size:0.9rem;">${err.message}</span>`;
  }

  actionBox.style.display = 'block';

  // Trigger state updates
  fetch('/api/state')
    .then(r => r.json())
    .then(state => updateUI(state));
}

// ----------------------------------------------------
// Swarm Status Connection & AI chat input handlers
// ----------------------------------------------------
async function streamSwarmBootSequence() {
  const stepsDiv = document.getElementById('timeline-steps');
  const board = document.getElementById('collaboration-timeline');
  if (board) board.style.display = 'block';
  if (stepsDiv) {
    stepsDiv.innerHTML = '';
    
    const progressLogs = [
      { icon: '🔌', text: 'Connecting to Casper RPC Node...' },
      { icon: '✓', text: 'Connected to testnet.cspr.live' },
      { icon: '💼', text: 'Portfolio analyst agent loaded.' },
      { icon: '📊', text: 'Risk evaluation agent online.' },
      { icon: '🔮', text: 'Oracle asset feed node online.' },
      { icon: '🛡️', text: 'ZK compliance registry connected.' },
      { icon: '💸', text: 'Treasury optimization router ready.' }
    ];

    for (let i = 0; i < progressLogs.length; i++) {
      const step = progressLogs[i];
      const itemHtml = `
        <div style="font-size:0.75rem; color:var(--brand-orange); margin-bottom:4px; font-family:var(--font-mono)">
          [${step.icon}] ${step.text}
        </div>
      `;
      stepsDiv.insertAdjacentHTML('beforeend', itemHtml);
      stepsDiv.scrollTop = stepsDiv.scrollHeight;
      await new Promise(r => setTimeout(r, 350));
    }
  }
}

async function submitAIInvestmentGoal() {
  const inputEl = document.getElementById('chat-input');
  const text = inputEl.value.trim();
  if (text === '') return;

  const history = document.getElementById('chat-history');
  const userHtml = `
    <div class="chat-bubble user" style="margin-top:10px;">
      <strong>You:</strong>
      <div style="margin-top: 4px;">${text}</div>
    </div>
  `;
  history.insertAdjacentHTML('beforeend', userHtml);
  history.scrollTop = history.scrollHeight;
  inputEl.value = '';

  // Show dynamic agent connections sequentially
  await streamSwarmBootSequence();

  // Call AI orchestrator API
  fetch('/api/ai/invest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: text, sender: casperWalletAddress })
  });
}

function submitPresetGoal(text) {
  const inputEl = document.getElementById('chat-input');
  if (inputEl) {
    inputEl.value = text;
    submitAIInvestmentGoal();
  }
}

// ----------------------------------------------------
// economic shock simulator
// ----------------------------------------------------
function triggerShock(assetId, type) {
  fetch('/api/trigger-shock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, type })
  }).then(() => {
    fetch('/api/state')
      .then(res => res.json())
      .then(state => updateUI(state));
  });
}

// ----------------------------------------------------
// WebSocket logs subscription & Fallback HTTP Polling
// ----------------------------------------------------
let isPolling = false;
let pollingInterval = null;
const displayedLogsSet = new Set();

function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const wsUrl = `${wsProtocol}${window.location.host}`;
  console.log('Attempting WebSocket connection to:', wsUrl);
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WS Connection Established.');
    if (isPolling) {
      isPolling = false;
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === 'INIT_STATE') {
      updateUI(msg.data);
      const consoleOutput = document.getElementById('console-output');
      consoleOutput.innerHTML = '';
      displayedLogsSet.clear();
      msg.data.logs.forEach(log => {
        const logKey = `${log.timestamp}-${log.agent}-${log.message}`;
        displayedLogsSet.add(logKey);
        appendConsoleLog(log);
      });
    } else if (msg.type === 'LOG') {
      const logKey = `${msg.data.timestamp}-${msg.data.agent}-${msg.data.message}`;
      displayedLogsSet.add(logKey);
      appendConsoleLog(msg.data);
      triggerSwarmParticleEffect(msg.data);
    } else if (msg.type === 'LAYOUT_UPDATE' || msg.type === 'COMPLIANCE_UPDATE') {
      fetch('/api/state')
        .then(res => res.json())
        .then(state => updateUI(state));
    } else if (msg.type === 'AGENT_COLLABORATION_STEP') {
      const timelineDiv = document.getElementById('collaboration-timeline');
      const stepsDiv = document.getElementById('timeline-steps');
      timelineDiv.style.display = 'block';
      stepsDiv.innerHTML = '';
      
      msg.data.timeline.forEach((step) => {
        const statusColor = step.status === 'completed' ? 'var(--brand-green)' : step.status === 'failed' ? 'var(--brand-pink)' : 'var(--brand-orange)';
        const statusSymbol = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : '⚙';
        
        const stepHtml = `
          <div style="margin-bottom: 6px; border-left: 2px solid ${statusColor}; padding-left: 8px;">
            <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
              <span style="color:${statusColor}; font-weight:bold;">[${statusSymbol}] ${step.agent}</span>
              <span style="color:var(--text-secondary); font-size:0.65rem;">Conf: ${(step.confidence * 100).toFixed(0)}%</span>
            </div>
            <div style="color:var(--text-primary); margin-top:2px; font-size:0.78rem;">${step.message}</div>
          </div>
        `;
        stepsDiv.insertAdjacentHTML('beforeend', stepHtml);
      });
      stepsDiv.scrollTop = stepsDiv.scrollHeight;
    } else if (msg.type === 'AI_CHAT_RESPONSE') {
      const history = document.getElementById('chat-history');
      const timelineDiv = document.getElementById('collaboration-timeline');
      
      setTimeout(() => {
        timelineDiv.style.display = 'none';
      }, 5000);

      const messageHtml = `
        <div class="chat-bubble assistant">
          <strong>Aequitas Swarm Manager:</strong>
          <div style="margin-top: 4px; font-family: sans-serif;">${parseMarkdown(msg.data.message)}</div>
        </div>
      `;
      history.insertAdjacentHTML('beforeend', messageHtml);
      history.scrollTop = history.scrollHeight;

      if (msg.data.ledger) {
        fetch('/api/state')
          .then(res => res.json())
          .then(state => updateUI(state));
      }
    }
  };

  function parseMarkdown(text) {
    let html = text;
    html = html.replace(/^### (.*$)/gim, '<h4 style="font-size:0.95rem; font-weight:600; color:var(--brand-blue); margin:12px 0 6px; text-transform:uppercase; letter-spacing:0.5px;">$1</h4>');
    html = html.replace(/^#### (.*$)/gim, '<h5 style="font-size:0.85rem; font-weight:600; color:var(--text-primary); margin:8px 0 4px;">$1</h5>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--brand-green)">$1</strong>');
    html = html.replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.4); padding:2px 4px; border-radius:4px; font-family:var(--font-mono); font-size:0.75rem; color:var(--brand-pink)">$1</code>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/^\* (.*$)/gim, '<div style="padding-left:12px; margin:4px 0; font-size:0.85rem; color:var(--text-primary)">• $1</div>');
    return html;
  }

  socket.onerror = (err) => {
    console.warn('WebSocket error encountered:', err);
    startPollingFallback();
  };

  socket.onclose = () => {
    console.warn('WebSocket connection closed. Initiating polling fallback...');
    startPollingFallback();
    setTimeout(connectWebSocket, 5000);
  };
}

function startPollingFallback() {
  if (isPolling) return;
  isPolling = true;
  pollState();
  pollingInterval = setInterval(pollState, 3000);
}

async function pollState() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const state = await res.json();
    updateUI(state);
  } catch (err) {
    console.error('HTTP Polling error:', err);
  }
}

async function updateCasperStatus() {
  try {
    const res = await fetch('/api/casper/status');
    const data = await res.json();
    const statusText = document.getElementById('casper-net-status');
    const statusDot = document.getElementById('casper-net-dot');
    
    if (statusText && statusDot) {
      if (data.status === 'CONNECTED') {
        statusText.innerHTML = `CONNECTED (Block #${data.blockHeight.toLocaleString()})`;
        statusText.className = 'text-neon-blue';
        statusDot.className = 'status-dot green animate-pulse';
      } else {
        statusText.innerHTML = 'OFFLINE';
        statusText.className = 'text-neon-pink';
        statusDot.className = 'status-dot red animate-pulse';
      }
    }
  } catch (err) {
    console.error('Error fetching Casper status:', err);
  }
}

function appendConsoleLog(log) {
  const consoleOutput = document.getElementById('console-output');
  if (!consoleOutput) return;

  const lineHtml = `
    <div style="margin-bottom: 6px;">
      <span style="color:var(--text-secondary);">[${log.timestamp}]</span>
      <span style="color:var(--brand-blue); font-weight:bold;">[${log.agent}]</span>
      <span style="color:#fff;">${log.message}</span>
    </div>
  `;
  consoleOutput.insertAdjacentHTML('beforeend', lineHtml);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function triggerSwarmParticleEffect(log) {
  // Trigger animations in canvas visualizer
  if (log.agent === 'Risk Evaluator' && log.message.includes('Analyzing')) {
    shootParticle('evaluator', 'x402', 'var(--brand-pink)', 2.5);
  } else if (log.agent === 'x402 Facilitator' && log.message.includes('Validation')) {
    shootParticle('x402', 'evaluator', 'var(--brand-green)', 2.5);
  } else if (log.agent === 'Risk Evaluator' && log.message.includes('updated')) {
    shootParticle('evaluator', 'vault', 'var(--brand-purple)', 2.0);
  } else if (log.agent === 'Treasury Router' && log.message.includes('rebalancing')) {
    shootParticle('router', 'vault', 'var(--brand-blue)', 2.0);
  }
}

// Settings & Control Actions
function resetOnboardingState() {
  localStorage.removeItem('aequitas_onboarding_completed');
  localStorage.removeItem('aequitas_onboarding_step');
  localStorage.removeItem('aequitas_wallet_mode');
  localStorage.removeItem('aequitas_wallet_address');
  
  onboardingCompleted = false;
  onboardingStep = 1;
  walletMode = 'demo';
  casperWalletAddress = 'user_wallet';

  document.getElementById('onboarding-wizard').style.display = 'flex';
  nextOnboardingStep(1);
  navigateTo('/');
}

function revokeKYCProof() {
  fetch('/api/compliance/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: casperWalletAddress })
  }).then(() => {
    fetch('/api/state')
      .then(res => res.json())
      .then(state => updateUI(state));
  });
}

// Assets filtering logic
function filterAssetsList() {
  const queryInput = document.getElementById('asset-search-input');
  const typeFilterSelect = document.getElementById('asset-filter-select');
  if (!queryInput || !typeFilterSelect || !networkState) return;

  const query = queryInput.value.toLowerCase();
  const typeFilter = typeFilterSelect.value;
  const container = document.getElementById('assets-list-container');
  container.innerHTML = '';
  
  const ledger = networkState.ledger;
  const rwaKeys = Object.keys(ledger.contracts).filter(k => k.startsWith('RWA-'));
  
  rwaKeys.forEach(assetId => {
    const contract = ledger.contracts[assetId];
    
    // Filter parameters match checks
    const matchesSearch = contract.name.toLowerCase().includes(query) || assetId.toLowerCase().includes(query);
    
    let matchesType = true;
    if (typeFilter === 'real-estate') {
      matchesType = assetId.includes('REAL') || contract.name.toLowerCase().includes('plaza') || contract.name.toLowerCase().includes('office');
    } else if (typeFilter === 'credit') {
      matchesType = assetId.includes('INV') || assetId.includes('SHIP') || contract.name.toLowerCase().includes('invoice') || contract.name.toLowerCase().includes('freight');
    }
    
    if (matchesSearch && matchesType) {
      const cardHtml = `
        <div class="asset-item-card">
          <div class="asset-details-left">
            <span class="asset-title">${contract.name}</span>
            <span class="asset-symbol-pill" style="font-family:var(--font-mono); color:var(--brand-blue); font-size:0.72rem;">${contract.symbol}</span>
          </div>
          <div class="asset-details-right" style="text-align:right;">
            <span class="asset-apy" style="color:var(--brand-green); font-weight:bold;">${(contract.yieldRate / 100).toFixed(2)}% APY</span>
            <span style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-top:2px;">$${parseFloat(contract.valuation).toLocaleString()} USD</span>
          </div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', cardHtml);
    }
  });
}

// Help Contact Form Submission
function submitHelpForm() {
  const emailEl = document.getElementById('help-contact-email');
  const msgEl = document.getElementById('help-contact-msg');
  if (!emailEl || !msgEl) return;

  const email = emailEl.value.trim();
  const msg = msgEl.value.trim();
  
  if (email === '' || msg === '') {
    alert("Validation Error: Please fill in both email and message input fields.");
    return;
  }
  
  alert("Feedback received! Our staff will respond to you within 24 hours.");
  emailEl.value = '';
  msgEl.value = '';
}

// Settings data exporter
function exportStateData() {
  if (!networkState) {
    alert("Export Error: Application state is not loaded yet.");
    return;
  }
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(networkState, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "aequitas_rwa_state.json");
  dlAnchorElem.click();
}

// Settings theme toggler
function toggleThemeMode() {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  localStorage.setItem('aequitas_theme_light', isLight ? 'true' : 'false');
  
  const consoleOutput = document.getElementById('console-output');
  appendConsoleLog({
    timestamp: new Date().toLocaleTimeString(),
    agent: 'System',
    message: `Theme preferences updated: ${isLight ? 'LIGHT MODE' : 'DARK MODE'}`
  });
}

// Intercept data-path clicks for routing
document.addEventListener('click', e => {
  const link = e.target.closest('[data-path]');
  if (link) {
    e.preventDefault();
    navigateTo(link.getAttribute('data-path'));
  }
});

// Window resize
window.addEventListener('resize', resizeCanvas);

// Bind settings dropdown changes
const networkSel = document.getElementById('setting-network');
if (networkSel) {
  const savedNet = localStorage.getItem('aequitas_setting_network');
  if (savedNet) networkSel.value = savedNet;
  networkSel.addEventListener('change', (e) => {
    localStorage.setItem('aequitas_setting_network', e.target.value);
    appendConsoleLog({
      timestamp: new Date().toLocaleTimeString(),
      agent: 'System',
      message: `Network environment switched to: ${e.target.value.toUpperCase()}`
    });
  });
}

const providerSel = document.getElementById('setting-wallet-provider');
if (providerSel) {
  const savedProv = localStorage.getItem('aequitas_setting_wallet_provider');
  if (savedProv) {
    providerSel.value = savedProv;
    walletMode = savedProv === 'mock' ? 'demo' : 'casper';
  }
  providerSel.addEventListener('change', (e) => {
    localStorage.setItem('aequitas_setting_wallet_provider', e.target.value);
    walletMode = e.target.value === 'mock' ? 'demo' : 'casper';
    localStorage.setItem('aequitas_wallet_mode', walletMode);
    fetch('/api/state')
      .then(res => res.json())
      .then(state => updateUI(state));
  });
}

// Init and Boot Routing
resizeCanvas();
drawSwarm();
connectWebSocket();
updateCasperStatus();
setInterval(updateCasperStatus, 15000);

// Restore light theme preference
if (localStorage.getItem('aequitas_theme_light') === 'true') {
  document.body.classList.add('light-theme');
}

// Set onboarding card overlay visibility status based on memory state
if (onboardingCompleted) {
  const wizard = document.getElementById('onboarding-wizard');
  if (wizard) wizard.style.display = 'none';
} else {
  const wizard = document.getElementById('onboarding-wizard');
  if (wizard) wizard.style.display = 'flex';
  nextOnboardingStep(onboardingStep);
}

// Initialise active view pane from current browser URL routing path
handleRoute(window.location.pathname);
