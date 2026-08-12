/* ============================================================
   KEYMARKET — App Logic v3
   Pricing · Lucky Wheel · Energy · Wallet · TRC-20 Checkout
   ============================================================ */

(function () {
  'use strict';

  /* ---- CONFIG ---- */
  const PLANS = [
    { id: 'pro-monthly',   name: 'Pro CDK',   price: 15,  desc: 'GPT-4, Claude, Gemini — 50K tok/day',  original: 20 },
    { id: 'max-monthly',   name: 'Max CDK',   price: 55,  desc: 'Unlimited tokens · all providers',     original: 100 },
    { id: 'ultra-monthly', name: 'Ultra CDK', price: 115, desc: 'Everything + dedicated routing',        original: 200 },
  ];

  const ENERGY_PACKS = [
    { energy: 5,  price: 0.99 },
    { energy: 15, price: 2.49 },
    { energy: 50, price: 5.99 },
  ];

  const TRC20_ADDRESS = 'TQguVRm3tDmZG7AeZ47Mk6qi6GTF1ZDqkZ';

  const WHEEL_SEGMENTS = [
    { label: '10 Coins',     coins: 10,  energy: 0, color: '#2a2920', textColor: '#9a9688' },
    { label: '25 Coins',     coins: 25,  energy: 0, color: '#1e2a1e', textColor: '#6abb82' },
    { label: '+1 Energy',    coins: 0,   energy: 1, color: '#2a2218', textColor: '#c8a44e' },
    { label: '50 Coins',     coins: 50,  energy: 0, color: '#1e2a2a', textColor: '#6a9bbb' },
    { label: '15 Coins',     coins: 15,  energy: 0, color: '#2a2920', textColor: '#9a9688' },
    { label: '150 Coins',    coins: 150, energy: 0, color: '#2a2218', textColor: '#c8a44e' },
    { label: '★ CDK KEY ★',  coins: 0,   energy: 0, cdk: true, color: '#3a2a10', textColor: '#c8a44e' },
    { label: '30 Coins',     coins: 30,  energy: 0, color: '#2a2920', textColor: '#9a9688' },
    { label: '+2 Energy',    coins: 0,   energy: 2, color: '#1e2a2a', textColor: '#6a9bbb' },
    { label: '10 Coins',     coins: 10,  energy: 0, color: '#2a2920', textColor: '#6b6860' },
    { label: '200 Coins',    coins: 200, energy: 0, color: '#2a2218', textColor: '#c8a44e' },
    { label: '+1 Energy',    coins: 0,   energy: 1, color: '#2a2920', textColor: '#9a9688' },
  ];

  const WHEEL_WEIGHTS = [15, 10, 12, 8, 16, 4, 0, 14, 8, 15, 2, 10];

  const MAX_ENERGY = 10;
  const ENERGY_REGEN_MS = 4 * 60 * 60 * 1000;
  const COINS_PER_CDK = 5000;

  /* ---- STATE ---- */
  let cart = [];           // plan IDs for subscription checkout
  let wallet = { coins: 0, energy: 3, totalSpins: 0, totalCoinsWon: 0 };
  let isSpinning = false;
  let wheelRotation = 0;
  let checkoutContext = null; // { type: 'plan'|'coins'|'energy', ... }

  /* ---- HELPERS ---- */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  function loadWallet() {
    try {
      const saved = localStorage.getItem('keymarket_wallet');
      if (saved) wallet = { ...wallet, ...JSON.parse(saved) };
      const lastSpin = parseInt(localStorage.getItem('keymarket_last_spin') || '0', 10);
      if (lastSpin) {
        const elapsed = Date.now() - lastSpin;
        const gained = Math.floor(elapsed / ENERGY_REGEN_MS);
        if (gained > 0) wallet.energy = Math.min(MAX_ENERGY, wallet.energy + gained);
      }
    } catch (e) { /* ignore */ }
    saveWallet();
  }

  function saveWallet() {
    try { localStorage.setItem('keymarket_wallet', JSON.stringify(wallet)); } catch (e) {}
  }

  function randHex(len) {
    return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /* ---- INIT ---- */
  document.addEventListener('DOMContentLoaded', () => {
    loadWallet();
    drawWheel();
    initAnimations();
    initNav();
    initCursorGlow();
    initHeroCanvas();
    initCountUp();
    initActivateSteps();
    initCart();
    initCheckout();
    initVerify();
    initWheel();
    initEnergyPacks();
    initSmoothAnchors();
    updateWalletUI();
  });

  /* ---- WALLET UI ---- */
  function updateWalletUI() {
    $('#coin-val').textContent = wallet.coins.toLocaleString();
    $('#energy-val').textContent = wallet.energy;
    const pct = (wallet.energy / MAX_ENERGY) * 100;
    $('#energy-fill').style.width = pct + '%';
    $('#energy-fill-lg').style.width = pct + '%';
    $('#energy-text').textContent = `${wallet.energy} / ${MAX_ENERGY}`;
    $('#ws-spins').textContent = wallet.totalSpins.toLocaleString();
    $('#ws-coins').textContent = wallet.totalCoinsWon.toLocaleString();
    updateSpinBtn();
  }

  function updateSpinBtn() {
    const btn = $('#spin-btn');
    if (isSpinning) {
      btn.disabled = true;
      btn.classList.add('spinning');
      return;
    }
    btn.classList.remove('spinning');
    btn.disabled = wallet.energy <= 0;
    $('span', btn).textContent = wallet.energy > 0 ? 'SPIN' : 'NO ENERGY';
    $('small', btn).textContent = wallet.energy > 0 ? '1 energy' : 'Buy more';
  }

  /* ---- WHEEL DRAWING ---- */
  function drawWheel() {
    const canvas = $('#wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const displaySize = 400;
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = displaySize + 'px';
    canvas.style.height = displaySize + 'px';
    ctx.scale(dpr, dpr);
    const size = displaySize;
    const cx = size / 2, cy = size / 2, r = size / 2 - 6;
    const segCount = WHEEL_SEGMENTS.length;
    const segAngle = (2 * Math.PI) / segCount;

    ctx.clearRect(0, 0, size, size);

    WHEEL_SEGMENTS.forEach((seg, i) => {
      const startAngle = i * segAngle - Math.PI / 2;
      const endAngle = startAngle + segAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,164,78,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + segAngle / 2);
      ctx.fillStyle = seg.textColor;
      ctx.font = seg.cdk ? 'bold 16px "Space Grotesk", sans-serif' : '13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seg.label, r * 0.62, 0);
      ctx.restore();
    });

    ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fillStyle = '#141310'; ctx.fill();
    ctx.strokeStyle = 'rgba(200,164,78,0.3)'; ctx.lineWidth = 2; ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,164,78,0.2)'; ctx.lineWidth = 2; ctx.stroke();

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + (r + 2) * Math.cos(angle), cy + (r + 2) * Math.sin(angle), 2, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(200,164,78,0.5)' : 'rgba(200,164,78,0.15)';
      ctx.fill();
    }
  }

  /* ---- WHEEL SPIN ---- */
  function initWheel() {
    $('#spin-btn').addEventListener('click', spin);
    updateSpinBtn();
  }

  function spin() {
    if (isSpinning || wallet.energy <= 0) return;
    isSpinning = true;
    wallet.energy--;
    wallet.totalSpins++;
    saveWallet();
    updateWalletUI();

    const canvas = $('#wheel-canvas');
    const segCount = WHEEL_SEGMENTS.length;
    const segAngle = 360 / segCount;
    const targetIndex = weightedRandomExclude(WHEEL_WEIGHTS, 6);
    const targetDeg = 360 - (targetIndex * segAngle + segAngle / 2);
    const jitter = (Math.random() - 0.5) * segAngle * 0.6;
    const spins = 5 + Math.floor(Math.random() * 3);
    const totalRotation = spins * 360 + targetDeg + jitter;
    wheelRotation += totalRotation;

    canvas.style.transition = 'transform 4.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    canvas.style.transform = `rotate(${wheelRotation}deg)`;

    setTimeout(() => {
      isSpinning = false;
      localStorage.setItem('keymarket_last_spin', Date.now().toString());
      const segment = WHEEL_SEGMENTS[targetIndex];
      if (segment.energy > 0) {
        wallet.energy = Math.min(MAX_ENERGY, wallet.energy + segment.energy);
      }
      if (segment.coins > 0) {
        wallet.coins += segment.coins;
        wallet.totalCoinsWon += segment.coins;
      }
      saveWallet();
      updateWalletUI();
      showWin(segment);
    }, 4800);
  }

  function weightedRandomExclude(weights, excludeIndex) {
    const filtered = weights.map((w, i) => i === excludeIndex ? 0 : w);
    const total = filtered.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < filtered.length; i++) {
      r -= filtered[i];
      if (r <= 0) return i;
    }
    for (let i = 0; i < filtered.length; i++) {
      if (i !== excludeIndex) return i;
    }
    return 0;
  }

  /* ---- WIN OVERLAY ---- */
  function showWin(segment) {
    const overlay = $('#win-overlay');
    $('#win-icon').textContent = '●';
    $('#win-icon').style.color = segment.textColor;
    $('#win-title').textContent = 'You won!';
    $('#win-desc').textContent = segment.label;

    if (segment.energy > 0) {
      $('#win-amount').textContent = `+${segment.energy} energy`;
    } else if (segment.cdk) {
      $('#win-amount').textContent = 'CDK Key!';
    } else {
      $('#win-amount').textContent = `+${segment.coins} coins`;
    }
    $('#win-amount').style.cursor = 'default';
    $('#win-amount').onclick = null;
    overlay.classList.remove('hidden');
    spawnConfetti($('#win-particles'));

    const claimBtn = $('#win-claim');
    claimBtn.textContent = 'Claim Reward';
    claimBtn.onclick = () => {
      overlay.classList.add('hidden');
      $('#win-particles').innerHTML = '';
      if (wallet.coins >= COINS_PER_CDK) showCDKRedeemNotice();
    };
  }

  function spawnConfetti(container) {
    container.innerHTML = '';
    const colors = ['#c8a44e', '#6abb82', '#6a9bbb', '#e8e4dc', '#c55a5a', '#a855f7'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'win-particle';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = '-10px';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      const s = (4 + Math.random() * 8) + 'px';
      p.style.width = s; p.style.height = s;
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      p.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      if (Math.random() > 0.5) p.style.borderRadius = '2px';
      container.appendChild(p);
    }
  }

  function showCDKRedeemNotice() {
    const overlay = $('#win-overlay');
    $('#win-icon').textContent = '◆';
    $('#win-icon').style.color = '#c8a44e';
    $('#win-title').textContent = 'Redeem Available!';
    $('#win-desc').textContent = `You have ${wallet.coins} coins — enough for a free CDK key (${COINS_PER_CDK} coins)`;
    const amount = $('#win-amount');
    amount.textContent = `${COINS_PER_CDK} coins → 1 CDK`;
    amount.style.cursor = 'pointer';
    amount.onclick = () => {
      wallet.coins -= COINS_PER_CDK;
      saveWallet();
      updateWalletUI();
      amount.textContent = 'CDK Claimed!';
      amount.style.cursor = 'default';
      amount.onclick = null;
      setTimeout(() => overlay.classList.add('hidden'), 2000);
    };
    overlay.classList.remove('hidden');
    const claimBtn = $('#win-claim');
    claimBtn.textContent = 'Close';
    claimBtn.onclick = () => {
      overlay.classList.add('hidden');
      amount.style.cursor = 'default';
      amount.onclick = null;
    };
  }

  /* ---- ENERGY PACKS → Checkout ---- */
  function initEnergyPacks() {
    $$('.energy-pack-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const energy = parseInt(btn.dataset.energy, 10);
        const price = parseFloat(btn.dataset.price);
        if (!energy || !price) return;
        openCheckout({
          type: 'energy',
          name: `+${energy} Energy`,
          price: price,
        });
      });
    });
  }

  /* ---- CART (CDK plans) ---- */
  function addToCart(id) {
    if (cart.includes(id)) return;
    cart.push(id);
    updateCartUI();
  }

  function removeFromCart(id) {
    cart = cart.filter(c => c !== id);
    updateCartUI();
  }

  function updateCartUI() {
    const count = $('#cart-count');
    count.textContent = cart.length;
    count.classList.toggle('show', cart.length > 0);

    const items = $('#cart-items');
    const checkoutBtn = $('#checkout-btn');

    if (cart.length === 0) {
      items.innerHTML = '<div class="cart-empty">Your cart is empty</div>';
      checkoutBtn.disabled = true;
    } else {
      checkoutBtn.disabled = false;
      items.innerHTML = cart.map(id => {
        const plan = PLANS.find(p => p.id === id);
        if (!plan) return '';
        return `
          <div class="cart-item">
            <div class="cart-item-info">
              <h4>${plan.name}</h4>
              <span>${plan.desc}</span>
            </div>
            <div class="cart-item-right">
              <span class="cart-item-price">$${plan.price.toFixed(2)}</span>
              <button class="cart-remove" data-id="${id}" aria-label="Remove">✕</button>
            </div>
          </div>
        `;
      }).join('');
      $$('.cart-remove', items).forEach(btn => {
        btn.addEventListener('click', () => removeFromCart(btn.dataset.id));
      });
    }

    const total = cart.reduce((sum, id) => {
      const plan = PLANS.find(p => p.id === id);
      return sum + (plan ? plan.price : 0);
    }, 0);
    $('#cart-total-val').textContent = `$${total.toFixed(2)}`;
  }

  function initCart() {
    const overlay = $('#cart-overlay');
    const drawer = $('#cart-drawer');

    $('#cart-toggle').addEventListener('click', () => {
      overlay.classList.remove('hidden');
      requestAnimationFrame(() => {
        overlay.classList.add('open');
        drawer.classList.add('open');
      });
    });

    function closeCart() {
      overlay.classList.remove('open');
      drawer.classList.remove('open');
      setTimeout(() => overlay.classList.add('hidden'), 400);
    }

    $('#cart-close').addEventListener('click', closeCart);
    overlay.addEventListener('click', closeCart);

    // Pricing buy buttons → add to cart & open drawer
    $$('.pricing-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        const planId = btn.dataset.plan;
        addToCart(planId);
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => {
          overlay.classList.add('open');
          drawer.classList.add('open');
        });
      });
    });

    // Cart checkout → open checkout modal
    const checkoutBtn = $('#checkout-btn');
    checkoutBtn.addEventListener('click', () => {
      if (cart.length === 0) return;
      const total = cart.reduce((sum, id) => {
        const plan = PLANS.find(p => p.id === id);
        return sum + (plan ? plan.price : 0);
      }, 0);
      const names = cart.map(id => {
        const plan = PLANS.find(p => p.id === id);
        return plan ? plan.name : id;
      });
      openCheckout({
        type: 'plan',
        name: names.join(', '),
        price: total,
      });
      closeCart();
    });
  }

  /* ---- CHECKOUT MODAL ---- */
  function openCheckout(context) {
    checkoutContext = context;
    const modal = $('#checkout-modal');
    const summary = $('#checkout-summary');

    // Build summary
    summary.innerHTML = `
      <div class="summary-row">
        <span class="summary-name">${context.name}</span>
        <span class="summary-price">$${context.price.toFixed(2)}</span>
      </div>
      <div class="summary-total">
        <span>Total</span>
        <span class="summary-price">$${context.price.toFixed(2)}</span>
      </div>
    `;

    // Set payment info
    $('#pay-amount').textContent = `${context.price.toFixed(2)} USDT`;
    $('#pay-address').textContent = TRC20_ADDRESS;
    $('#pay-network').textContent = 'TRC-20 (Tron)';
    $('#checkout-title').textContent =
      context.type === 'energy' ? 'Buy Energy' :
      context.type === 'coins'  ? 'Buy Coins'  : 'CDK Payment';

    modal.classList.remove('hidden');
  }

  function initCheckout() {
    const modal = $('#checkout-modal');
    const backdrop = $('.modal-backdrop', modal);

    function closeModal() {
      modal.classList.add('hidden');
      resetConfirmForm();
    }
    backdrop.addEventListener('click', closeModal);
    $('.modal-close', modal).addEventListener('click', closeModal);

    // Copy address
    const copyBtn = $('#copy-address');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const addr = $('#pay-address').textContent;
        if (addr && addr !== '—') {
          navigator.clipboard.writeText(addr).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => { copyBtn.textContent = '⎘'; }, 1500);
          });
        }
      });
    }

    // Screenshot file label
    const fileInput = $('#confirm-screenshot');
    const fileLabel = $('#file-label-text');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
          fileLabel.textContent = '✓ ' + fileInput.files[0].name;
          fileLabel.closest('.file-upload-btn').classList.add('has-file');
        } else {
          fileLabel.textContent = '📎 Attach receipt image';
          fileLabel.closest('.file-upload-btn').classList.remove('has-file');
        }
      });
    }

    // Confirm payment button
    const confirmBtn = $('#confirm-pay-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const tg = $('#confirm-tg').value.trim();
        const txid = $('#confirm-txid').value.trim();

        if (!tg) { $('#confirm-tg').focus(); $('#confirm-tg').style.borderColor = 'var(--red)'; return; }
        if (!txid) { $('#confirm-txid').focus(); $('#confirm-txid').style.borderColor = 'var(--red)'; return; }

        // Fill pending details
        $('#pending-tg').textContent = tg;
        $('#pending-txid').textContent = txid.length > 24 ? txid.slice(0, 12) + '…' + txid.slice(-8) : txid;

        // Hide form, show pending
        $('#pay-confirm-section').classList.add('hidden');
        $('#pay-pending').classList.remove('hidden');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Submitted ✓';
      });
    }
  }

  function resetConfirmForm() {
    const section = $('#pay-confirm-section');
    const pending = $('#pay-pending');
    if (section) section.classList.remove('hidden');
    if (pending) pending.classList.add('hidden');
    const tg = $('#confirm-tg');
    const txid = $('#confirm-txid');
    const file = $('#confirm-screenshot');
    const fileLabel = $('#file-label-text');
    const btn = $('#confirm-pay-btn');
    if (tg) { tg.value = ''; tg.style.borderColor = ''; }
    if (txid) { txid.value = ''; txid.style.borderColor = ''; }
    if (file) file.value = '';
    if (fileLabel) { fileLabel.textContent = '📎 Attach receipt image'; fileLabel.closest('.file-upload-btn').classList.remove('has-file'); }
    if (btn) { btn.disabled = false; btn.textContent = "I've Paid — Verify"; }
  }

  /* ---- VERIFY ---- */
  function initVerify() {
    const btn = $('#verify-btn');
    const input = $('#cdk-input');
    const result = $('#verify-result');

    btn.addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) return;
      btn.textContent = 'Verifying...';
      btn.disabled = true;

      setTimeout(() => {
        btn.textContent = 'Verify';
        btn.disabled = false;
        const isValid = val.length >= 10 && Math.random() > 0.3;
        result.classList.remove('hidden', 'valid', 'invalid');

        if (isValid) {
          result.classList.add('valid');
          result.innerHTML = `
            <div class="verify-row"><span class="label">Status</span><span class="value valid-val">✓ Valid</span></div>
            <div class="verify-row"><span class="label">Service</span><span class="value">GPT-4 Turbo</span></div>
            <div class="verify-row"><span class="label">Provider</span><span class="value">OpenAI</span></div>
            <div class="verify-row"><span class="label">Tier</span><span class="value">MAX</span></div>
            <div class="verify-row"><span class="label">Expires</span><span class="value">2025-09-15</span></div>
            <div class="verify-row"><span class="label">Mint Tx</span><span class="value">0x${randHex(8)}...${randHex(4)}</span></div>
          `;
        } else {
          result.classList.add('invalid');
          result.innerHTML = `
            <div class="verify-row"><span class="label">Status</span><span class="value invalid-val">✕ Invalid</span></div>
            <div class="verify-row"><span class="label">Reason</span><span class="value">CDK not found or expired</span></div>
          `;
        }
      }, 1200);
    });

    input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  }

  /* ---- NAVIGATION ---- */
  function initNav() {
    const header = $('#site-header');
    let lastY = 0, ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        header.classList.toggle('scrolled', y > 40);
        header.classList.toggle('hidden-header', y > lastY && y > 200);
        lastY = y;
        ticking = false;
      });
    });
  }

  /* ---- SMOOTH ANCHORS ---- */
  function initSmoothAnchors() {
    $$('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const href = a.getAttribute('href');
        if (href === '#') return;
        const target = $(href);
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    });
  }

  /* ---- CURSOR GLOW ---- */
  function initCursorGlow() {
    const glow = $('#cursor-glow');
    let mx = 0, my = 0, gx = 0, gy = 0;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
    function tick() {
      gx += (mx - gx) * 0.08; gy += (my - gy) * 0.08;
      glow.style.left = gx + 'px'; glow.style.top = gy + 'px';
      requestAnimationFrame(tick);
    }
    tick();
  }

  /* ---- HERO CANVAS ---- */
  function initHeroCanvas() {
    const canvas = $('#hero-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles = [];
    function resize() { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * (w || 800), y: Math.random() * (h || 600),
        r: Math.random() * 1.5 + 0.5,
        dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.3 + 0.05
      });
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(200,164,78,${0.04 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      particles.forEach(p => {
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > w) p.dx *= -1;
        if (p.y < 0 || p.y > h) p.dy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,164,78,${p.alpha})`; ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
  }

  /* ---- COUNT-UP ---- */
  function initCountUp() {
    const els = $$('[data-count]'), observed = new Set();
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !observed.has(entry.target)) {
          observed.add(entry.target);
          animateCount(entry.target);
        }
      });
    }, { threshold: 0.5 });
    els.forEach(el => io.observe(el));
  }

  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    const start = performance.now(), duration = 2000;
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.floor((1 - Math.pow(1 - progress, 3)) * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---- ACTIVATE STEPS ---- */
  function initActivateSteps() {
    const steps = $$('.activate-step');
    if (!steps.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          steps.forEach((step, i) => setTimeout(() => step.classList.add('active-step'), i * 300));
          io.disconnect();
        }
      });
    }, { threshold: 0.3 });
    io.observe(steps[0].closest('.activate-card'));
  }

  /* ---- FADE-UP ---- */
  function initAnimations() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('visible'), parseInt(entry.target.dataset.delay || 0, 10) * 120);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    $$('.anim-fade-up').forEach(el => io.observe(el));
  }

})();
