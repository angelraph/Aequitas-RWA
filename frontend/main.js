// Aequitas RWA - Interactive Swarm Logic & Controller Playground

// Global state
let networkState = null;
let currentAction = 'deposit'; // 'deposit' or 'withdraw'
let socket = null;
let logFilter = 'all';
let selectedNodeId = null;

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
      // Wave shape distribution
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
    // RWA Token Contract
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
  document.getElementById('tvl-value').innerHTML = `${tvl.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span class="unit">CSPR</span>`;
  
  // APY weighting
  let weightedApySum = 0;
  let totalAllocated = 0;
  const rwaKeys = Object.keys(ledger.contracts).filter(k => k.startsWith('RWA-'));

  rwaKeys.forEach(assetId => {
    const contract = ledger.contracts[assetId];
    const allocation = parseFloat(vault.allocations[assetId] || '0');
    weightedApySum += (contract.yieldRate / 100) * allocation;
    totalAllocated += allocation;
  });

  const avgApy = totalAllocated > 0 ? (weightedApySum / totalAllocated) : 7.85;
  document.getElementById('avg-yield').innerText = `${avgApy.toFixed(2)}%`;

  // 2. User Wallet Info
  const userWallet = ledger.accounts['user_wallet'];
  document.getElementById('user-balance').innerText = parseFloat(userWallet.balance).toLocaleString(undefined, { minimumFractionDigits: 2 });
  
  const userVaultDeposit = parseFloat(vault.balances['user_wallet'] || '0');
  if (currentAction === 'deposit') {
    document.getElementById('btn-submit-action').innerText = `Execute Deposit`;
  } else {
    document.getElementById('btn-submit-action').innerText = `Execute Withdraw (Max: ${userVaultDeposit.toLocaleString()} CSPR)`;
  }

  // 3. Allocation Progress Bars
  const allocList = document.getElementById('allocation-bars');
  allocList.innerHTML = '';
  rwaKeys.forEach((assetId, index) => {
    const allocation = parseFloat(vault.allocations[assetId] || '0');
    const percent = tvl > 0 ? ((allocation / tvl) * 100) : 0;
    const colors = ['var(--neon-blue)', 'var(--neon-purple)', 'var(--neon-pink)', 'var(--neon-orange)', '#ffff00'];
    const color = colors[index % colors.length];

    const itemHtml = `
      <div class="allocation-item">
        <div class="allocation-meta">
          <span>${assetId}</span>
          <strong style="color: ${color}">${percent.toFixed(1)}% (${Math.round(allocation).toLocaleString()} CSPR)</strong>
        </div>
        <div class="bar-container">
          <div class="bar-fill" style="width: ${percent}%; background: ${color};"></div>
        </div>
      </div>
    `;
    allocList.insertAdjacentHTML('beforeend', itemHtml);
  });

  // 4. Asset Table Body
  const tableBody = document.getElementById('asset-table-body');
  tableBody.innerHTML = '';
  rwaKeys.forEach(assetId => {
    const contract = ledger.contracts[assetId];
    const allocation = parseFloat(vault.allocations[assetId] || '0');
    const ratingClass = contract.riskRating.substring(0, 1).toLowerCase();

    const rowHtml = `
      <tr>
        <td><span class="address-tag" style="color: var(--neon-blue);">${contract.symbol}</span></td>
        <td><strong>${contract.name}</strong></td>
        <td>$${parseFloat(contract.valuation).toLocaleString()}</td>
        <td><span class="badge-risk ${ratingClass}">${contract.riskRating}</span></td>
        <td class="text-neon-green"><strong>${(contract.yieldRate / 100).toFixed(2)}%</strong></td>
        <td><span class="text-neon-blue">${Math.round(allocation).toLocaleString()} CSPR</span></td>
        <td><span class="status-dot green animate-pulse" style="display:inline-block; margin-right:4px;"></span>Active</td>
      </tr>
    `;
    tableBody.insertAdjacentHTML('beforeend', rowHtml);
  });

  // 5. Economic Shocks Simulator
  const shocksContainer = document.getElementById('shocks-controls');
  shocksContainer.innerHTML = '';
  rwaKeys.forEach(assetId => {
    const offChainData = state.offChain[assetId] || { riskRating: 'A' };
    const rowHtml = `
      <div class="asset-shock-row">
        <span class="asset-shock-name">${assetId} (${offChainData.riskRating})</span>
        <div class="shock-btn-group">
          <button class="btn-shock green" onclick="triggerShock('${assetId}', 'upgrade')">Upgrade</button>
          <button class="btn-shock red" onclick="triggerShock('${assetId}', 'downgrade')">Downgrade</button>
          <button class="btn-shock red" onclick="triggerShock('${assetId}', 'valuation_drop')">Crash Val</button>
        </div>
      </div>
    `;
    shocksContainer.insertAdjacentHTML('beforeend', rowHtml);
  });

  // 6. Parameter selector dropdown
  const assetSelect = document.getElementById('param-asset-select');
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

  // Update automation buttons
  const autoBtn = document.getElementById('btn-automation-toggle');
  const manualTriggers = document.getElementById('manual-triggers-panel');
  if (state.agentAutomation) {
    autoBtn.innerText = 'ON';
    autoBtn.classList.add('active');
    manualTriggers.style.display = 'none';
  } else {
    autoBtn.innerText = 'OFF';
    autoBtn.classList.remove('active');
    manualTriggers.style.display = 'flex';
  }

  // Refresh inspector details if currently open
  if (selectedNodeId) {
    inspectNode(selectedNodeId);
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
// WebSocket logs subscription
// ----------------------------------------------------
function connectWebSocket() {
  const wsUrl = `ws://${window.location.host}`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WS Connection Established.');
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === 'INIT_STATE') {
      updateUI(msg.data);
      const consoleOutput = document.getElementById('console-output');
      consoleOutput.innerHTML = '';
      msg.data.logs.forEach(log => appendConsoleLog(log));
    } else if (msg.type === 'LOG') {
      appendConsoleLog(msg.data);
      triggerSwarmParticleEffect(msg.data);
    } else if (msg.type === 'LAYOUT_UPDATE') {
      // Deployed a new token, reload coordinates
      fetch('/api/state')
        .then(res => res.json())
        .then(state => updateUI(state));
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };
}

// Filter and append logs to console
function appendConsoleLog(log) {
  const consoleOutput = document.getElementById('console-output');
  
  let match = false;
  if (logFilter === 'all') match = true;
  else if (logFilter === 'evaluator' && log.agent === 'Risk Evaluator') match = true;
  else if (logFilter === 'router' && log.agent === 'Treasury Router') match = true;
  else if (logFilter === 'x402' && log.agent === 'x402 Facilitator') match = true;
  else if (logFilter === 'casper' && (log.agent === 'Casper Network' || log.agent === 'System')) match = true;

  const lineHtml = `
    <div class="log-line ${log.agent.toLowerCase().replace(' ', '_')} ${log.type === 'error' ? 'error' : ''}" style="display: ${match ? 'block' : 'none'}" data-agent="${log.agent}">
      <span class="log-time">[${log.timestamp}]</span>
      <span class="log-tag">[${log.agent}]</span>
      ${log.message}
    </div>
  `;
  consoleOutput.insertAdjacentHTML('beforeend', lineHtml);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// ----------------------------------------------------
// Dynamic Particle Animations
// ----------------------------------------------------
function triggerSwarmParticleEffect(log) {
  const text = log.message.toLowerCase();
  
  if (log.agent === 'Risk Evaluator' && text.includes('analyzing market')) {
    const matches = log.message.match(/RWA-[A-Z0-9-]+/);
    if (matches && nodes[matches[0]]) {
      shootParticle('evaluator', matches[0], 'var(--neon-purple)', 1.5, 3);
    }
  }
  else if (log.agent === 'x402 Facilitator' && text.includes('requires payment')) {
    shootParticle('x402', 'evaluator', 'var(--neon-pink)', 2.0, 4);
  }
  else if (log.agent === 'Risk Evaluator' && text.includes('authorizing micropayment')) {
    shootParticle('evaluator', 'x402', 'var(--neon-pink)', 2.2, 4.5);
  }
  else if (log.agent === 'x402 Facilitator' && text.includes('settlement approved')) {
    shootParticle('x402', 'vault', 'var(--neon-green)', 2.5, 4);
  }
  else if (log.agent === 'Casper Network' && text.includes('state updated')) {
    const matches = log.message.match(/RWA-[A-Z0-9-]+/);
    if (matches && nodes[matches[0]]) {
      shootParticle('evaluator', matches[0], 'var(--neon-green)', 2.0, 4);
    }
  }
  else if (log.agent === 'Treasury Router' && text.includes('recalculating optimal')) {
    shootParticle('router', 'vault', 'var(--neon-blue)', 1.2, 3);
  }
  else if (log.agent === 'Casper Network' && text.includes('reallocation complete')) {
    shootParticle('router', 'vault', 'var(--neon-blue)', 2.5, 5);
    setTimeout(() => {
      // Shoot particles to all active RWA nodes
      Object.keys(nodes).forEach(key => {
        if (key.startsWith('RWA-')) {
          shootParticle('vault', key, 'var(--neon-green)', 2.0, 3.5);
        }
      });
    }, 400);
  }
  else if (log.agent === 'Casper Network' && text.includes('deposit')) {
    shootParticle('vault', 'vault', 'var(--neon-blue)', 3.0, 6);
  }
  
  if (log.type === 'success' || log.type === 'transaction' || log.type === 'warning') {
    fetch('/api/state')
      .then(res => res.json())
      .then(state => updateUI(state));
  }
}

// ----------------------------------------------------
// CLI Command Console Parser
// ----------------------------------------------------
function executeCLICommand(cmdText) {
  const parts = cmdText.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const time = new Date().toLocaleTimeString();

  // Print command in console
  appendConsoleLog({
    timestamp: time,
    agent: 'System',
    message: `<span class="prompt-symbol">&gt;</span> <strong style="color:var(--neon-purple); font-family:monospace">${cmdText}</strong>`,
    type: 'info'
  });

  if (command === '/clear') {
    document.getElementById('console-output').innerHTML = '';
    return;
  }

  if (command === '/help') {
    const helpText = `
      <div style="margin: 0.5rem 0; padding-left: 10px; border-left: 2px solid var(--neon-purple);">
        <strong>Swarm Controller CLI Commands:</strong><br>
        • <code>/help</code> : Show available controller prompts.<br>
        • <code>/clear</code> : Clear terminal logs history.<br>
        • <code>/deploy &lt;name&gt; &lt;symbol&gt; &lt;valuation&gt; &lt;risk&gt; &lt;yield_apy&gt;</code> : Deploy a new RwaToken contract.<br>
        • <code>/price &lt;symbol&gt; &lt;valuation&gt; &lt;risk&gt; &lt;yield_apy&gt;</code> : Set asset off-chain pricing parameters.<br>
        • <code>/eval</code> : Trigger manual scrape & pricing cycle on evaluator agent.<br>
        • <code>/rebalance</code> : Trigger manual reallocation loop on treasury router.<br>
        • <code>/deposit &lt;amount&gt;</code> : Lock CSPR inside AequitasVault contract.<br>
        • <code>/withdraw &lt;amount&gt;</code> : Redeem CSPR from AequitasVault pool.
      </div>
    `;
    appendConsoleLog({ timestamp: time, agent: 'System', message: helpText, type: 'info' });
    return;
  }

  if (command === '/eval') {
    fetch('/api/agent-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'evaluator' })
    });
    return;
  }

  if (command === '/rebalance') {
    fetch('/api/agent-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'router' })
    });
    return;
  }

  if (command === '/deploy') {
    if (parts.length < 6) {
      appendConsoleLog({ timestamp: time, agent: 'System', message: 'Error: Missing parameters. Usage: <code>/deploy &lt;name&gt; &lt;symbol&gt; &lt;valuation&gt; &lt;risk&gt; &lt;yield&gt;</code>', type: 'error' });
      return;
    }
    const name = parts[1].replace(/_/g, ' '); // support underscore spaces
    const symbol = parts[2].toUpperCase();
    const valuation = parseFloat(parts[3]);
    const riskRating = parts[4].toUpperCase();
    const yieldRate = parseFloat(parts[5]) * 100;

    fetch('/api/deploy-rwa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, symbol, valuation, riskRating, yieldRate })
    }).then(res => {
      if (!res.ok) res.json().then(e => appendConsoleLog({ timestamp: time, agent: 'System', message: `Deploy error: ${e.error}`, type: 'error' }));
    });
    return;
  }

  if (command === '/price') {
    if (parts.length < 5) {
      appendConsoleLog({ timestamp: time, agent: 'System', message: 'Error: Missing parameters. Usage: <code>/price &lt;symbol&gt; &lt;valuation&gt; &lt;risk&gt; &lt;yield&gt;</code>', type: 'error' });
      return;
    }
    const symbol = parts[1].toUpperCase();
    const valuation = parseFloat(parts[2]);
    const riskRating = parts[3].toUpperCase();
    const yieldRate = parseFloat(parts[4]) * 100;

    fetch('/api/update-offchain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: symbol, valuation, riskRating, yieldRate })
    }).then(res => {
      if (!res.ok) res.json().then(e => appendConsoleLog({ timestamp: time, agent: 'System', message: `Override error: ${e.error}`, type: 'error' }));
    });
    return;
  }

  if (command === '/deposit') {
    if (parts.length < 2) {
      appendConsoleLog({ timestamp: time, agent: 'System', message: 'Error: Usage: <code>/deposit &lt;amount&gt;</code>', type: 'error' });
      return;
    }
    fetch('/api/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'user_wallet', amount: parts[1] })
    }).then(res => {
      if (!res.ok) res.json().then(e => appendConsoleLog({ timestamp: time, agent: 'System', message: `Error: ${e.error}`, type: 'error' }));
    });
    return;
  }

  if (command === '/withdraw') {
    if (parts.length < 2) {
      appendConsoleLog({ timestamp: time, agent: 'System', message: 'Error: Usage: <code>/withdraw &lt;amount&gt;</code>', type: 'error' });
      return;
    }
    fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'user_wallet', amount: parts[1] })
    }).then(res => {
      if (!res.ok) res.json().then(e => appendConsoleLog({ timestamp: time, agent: 'System', message: `Error: ${e.error}`, type: 'error' }));
    });
    return;
  }

  // Unknown command
  appendConsoleLog({
    timestamp: time,
    agent: 'System',
    message: `Unknown command prompt: "${command}". Type <code>/help</code> for options.`,
    type: 'error'
  });
}

// ----------------------------------------------------
// UI Action Handlers
// ----------------------------------------------------
async function executeVaultAction() {
  const inputAmount = document.getElementById('amount-input').value;
  const payload = {
    sender: 'user_wallet',
    amount: inputAmount
  };

  const endpoint = currentAction === 'deposit' ? '/api/deposit' : '/api/withdraw';
  
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      alert(`Transaction Rejected: ${result.error}`);
    } else {
      document.getElementById('amount-input').value = "5000";
    }
  } catch (err) {
    alert(`Error sending transaction: ${err.message}`);
  }
}

window.triggerShock = async function(assetId, type) {
  try {
    await fetch('/api/trigger-shock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, type })
    });
  } catch (err) {
    console.error(err);
  }
};

// ----------------------------------------------------
// Setup Event Listeners
// ----------------------------------------------------

// Tabs left panel
document.getElementById('tab-deposit').addEventListener('click', () => {
  currentAction = 'deposit';
  document.getElementById('tab-deposit').classList.add('active');
  document.getElementById('tab-withdraw').classList.remove('active');
  if (networkState) updateUI(networkState);
});

document.getElementById('tab-withdraw').addEventListener('click', () => {
  currentAction = 'withdraw';
  document.getElementById('tab-withdraw').classList.add('active');
  document.getElementById('tab-deposit').classList.remove('active');
  if (networkState) updateUI(networkState);
});

document.getElementById('btn-submit-action').addEventListener('click', executeVaultAction);

// Log filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    logFilter = e.target.getAttribute('data-filter');
    
    document.querySelectorAll('.log-line').forEach(line => {
      const agent = line.getAttribute('data-agent');
      let visible = false;
      if (logFilter === 'all') visible = true;
      else if (logFilter === 'evaluator' && agent === 'Risk Evaluator') visible = true;
      else if (logFilter === 'router' && agent === 'Treasury Router') visible = true;
      else if (logFilter === 'x402' && agent === 'x402 Facilitator') visible = true;
      else if (logFilter === 'casper' && (agent === 'Casper Network' || agent === 'System')) visible = true;
      
      line.style.display = visible ? 'block' : 'none';
    });
    
    const consoleOutput = document.getElementById('console-output');
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  });
});

// Control Deck Tabs
document.querySelectorAll('.deck-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.deck-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.deck-pane').forEach(p => p.classList.remove('active'));
    
    e.target.classList.add('active');
    const paneId = e.target.getAttribute('data-deck-tab');
    document.getElementById(paneId).classList.add('active');
  });
});

// Deploy form submit
document.getElementById('form-deploy-rwa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('deploy-name').value;
  const symbol = document.getElementById('deploy-symbol').value;
  const valuation = parseFloat(document.getElementById('deploy-valuation').value);
  const yieldRate = parseFloat(document.getElementById('deploy-yield').value) * 100;
  const riskRating = document.getElementById('deploy-risk').value;

  try {
    const res = await fetch('/api/deploy-rwa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, symbol, valuation, riskRating, yieldRate })
    });
    const result = await res.json();
    if (!res.ok) {
      alert(`Deployment Failed: ${result.error}`);
    } else {
      document.getElementById('deploy-name').value = "Commercial Plaza";
      document.getElementById('deploy-symbol').value = "RWA-PLZ-" + Math.floor(Math.random() * 900 + 100);
      document.getElementById('deploy-valuation').value = "1000000";
      document.getElementById('deploy-yield').value = "8.50";
      // Switch back to shocks tab to see updates
      document.querySelector('[data-deck-tab="deck-shocks"]').click();
    }
  } catch (err) {
    alert(`Deploy error: ${err.message}`);
  }
});

// Slider updates
document.getElementById('param-asset-select').addEventListener('change', syncSlidersToSelectedAsset);

document.getElementById('param-val-slider').addEventListener('input', (e) => {
  document.getElementById('val-slider-value').innerText = `$${parseInt(e.target.value).toLocaleString()}`;
});

document.getElementById('param-yield-slider').addEventListener('input', (e) => {
  document.getElementById('yield-slider-value').innerText = `${parseFloat(e.target.value).toFixed(2)}%`;
});

document.querySelectorAll('#param-risk-segments .segment-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('#param-risk-segments .segment-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  });
});

// Slider Apply Parameters Button
document.getElementById('btn-apply-parameters').addEventListener('click', async () => {
  const assetId = document.getElementById('param-asset-select').value;
  const valuation = document.getElementById('param-val-slider').value;
  const yieldRate = parseFloat(document.getElementById('param-yield-slider').value) * 100;
  const riskRating = document.querySelector('#param-risk-segments .segment-btn.active').getAttribute('data-risk');

  try {
    const res = await fetch('/api/update-offchain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, valuation, riskRating, yieldRate })
    });
    
    if (res.ok) {
      const btn = document.getElementById('btn-apply-parameters');
      btn.innerText = "Applied!";
      btn.style.boxShadow = '0 0 15px var(--neon-green)';
      setTimeout(() => {
        btn.innerText = "Apply Parameters";
        btn.style.boxShadow = '';
      }, 1500);
    }
  } catch (err) {
    console.error(err);
  }
});

// Agent Control Buttons
document.getElementById('btn-automation-toggle').addEventListener('click', async () => {
  const isCurrentlyActive = networkState && networkState.agentAutomation;
  const action = isCurrentlyActive ? 'pause' : 'resume';
  
  try {
    const res = await fetch('/api/agent-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const result = await res.json();
    if (res.ok) {
      fetch('/api/state')
        .then(r => r.json())
        .then(state => updateUI(state));
    }
  } catch (err) {
    console.error(err);
  }
});

document.getElementById('btn-trigger-evaluator').addEventListener('click', () => {
  fetch('/api/agent-trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'evaluator' })
  });
});

document.getElementById('btn-trigger-router').addEventListener('click', () => {
  fetch('/api/agent-trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'router' })
  });
});

// CLI Console Command Input
document.getElementById('console-cli').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = e.target.value;
    if (text.trim() !== '') {
      executeCLICommand(text);
      e.target.value = '';
    }
  }
});

// Inspect Panel Close button
document.getElementById('btn-inspect-close').addEventListener('click', () => {
  inspectNode(null);
});

// Canvas Clicks (Inspector)
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
  
  let clickedNodeId = null;
  
  Object.values(nodes).forEach(node => {
    const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
    if (dist < node.radius + 12) {
      clickedNodeId = node.id;
    }
  });
  
  inspectNode(clickedNodeId);
});

// Canvas Hover pointer change
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
  
  let hover = false;
  Object.values(nodes).forEach(node => {
    const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
    if (dist < node.radius + 12) {
      hover = true;
    }
  });
  
  canvas.style.cursor = hover ? 'pointer' : 'default';
});

// Window resize
window.addEventListener('resize', resizeCanvas);

// Init
resizeCanvas();
drawSwarm();
connectWebSocket();
