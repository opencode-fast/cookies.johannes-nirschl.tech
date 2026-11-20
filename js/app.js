/**
 * Cookie Leaderboard - Public App Script
 * Vanilla JS, no dependencies, joyful animations & arcade bakery vibes
 */

import {
  normalizeData,
  computeRankings,
  getRankTitle,
  formatRelativeTime
} from './shared.js';

// Application State
const state = {
  data: null,
  previousPeopleMap: new Map(), // id -> cookies
  bitesCount: 0,
  refreshTimer: null,
  relativeTimeTimer: null,
  isFetching: false
};

// DOM Elements
const elements = {
  // States
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  emptyState: document.getElementById('emptyState'),
  mainContent: document.getElementById('mainContent'),
  retryBtn: document.getElementById('retryBtn'),

  // Header Giant Cookie
  giantCookieBtn: document.getElementById('giantCookieBtn'),
  cookieSpeech: document.getElementById('cookieSpeech'),
  cookieBitesCutout: document.getElementById('cookieBitesCutout'),

  // Stats
  statTotalCookies: document.getElementById('statTotalCookies'),
  statCollectors: document.getElementById('statCollectors'),
  statLastUpdated: document.getElementById('statLastUpdated'),

  // Ticker
  tickerSection: document.getElementById('tickerSection'),
  tickerTrack: document.getElementById('tickerTrack'),

  // Podium
  podiumSection: document.getElementById('podiumSection'),
  podiumContainer: document.getElementById('podiumContainer'),

  // Leaderboard List
  leaderboardSection: document.getElementById('leaderboardSection'),
  leaderboardList: document.getElementById('leaderboardList'),

  // Canvas
  bgCanvas: document.getElementById('cookieBgCanvas')
};

// Check for reduced motion
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ==========================================================================
   Background Falling Particles (Canvas)
   ========================================================================== */
function initBackgroundParticles() {
  const canvas = elements.bgCanvas;
  if (!canvas || prefersReducedMotion()) return;

  const ctx = canvas.getContext('2d');
  let animationFrameId = null;
  const maxParticles = 24;

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize, { passive: true });
  resize();

  const particleTypes = ['cookie', 'crumb', 'sprinkle-pink', 'sprinkle-mint', 'sprinkle-gold'];
  const particles = [];

  for (let i = 0; i < maxParticles; i++) {
    particles.push(createParticle(canvas.width, canvas.height, true));
  }

  function createParticle(w, h, randomY = false) {
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : -20,
      size: 5 + Math.random() * 12,
      speedY: 0.4 + Math.random() * 0.8,
      speedX: (Math.random() - 0.5) * 0.4,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      type: particleTypes[Math.floor(Math.random() * particleTypes.length)],
      opacity: 0.35 + Math.random() * 0.45
    };
  }

  function drawParticle(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.opacity;

    if (p.type === 'cookie') {
      // Little mini cookie
      ctx.fillStyle = '#cf8c4a';
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#3d2314';
      // Tiny chips
      ctx.beginPath();
      ctx.arc(-p.size * 0.3, -p.size * 0.2, p.size * 0.2, 0, Math.PI * 2);
      ctx.arc(p.size * 0.3, p.size * 0.3, p.size * 0.2, 0, Math.PI * 2);
      ctx.arc(p.size * 0.2, -p.size * 0.35, p.size * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'crumb') {
      ctx.fillStyle = '#b37d4e';
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Sprinkle pill
      let color = '#ff5b79';
      if (p.type === 'sprinkle-mint') color = '#2ec4b6';
      if (p.type === 'sprinkle-gold') color = '#ffd166';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-p.size * 0.5, -p.size * 0.2, p.size, p.size * 0.4, p.size * 0.2);
      ctx.fill();
    }

    ctx.restore();
  }

  function render() {
    if (document.hidden || prefersReducedMotion()) {
      animationFrameId = null;
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.y += p.speedY;
      p.x += Math.sin(p.y * 0.01) * 0.5 + p.speedX;
      p.rotation += p.rotSpeed;

      if (p.y > canvas.height + 25) {
        Object.assign(p, createParticle(canvas.width, canvas.height, false));
      }

      drawParticle(p);
    }

    animationFrameId = requestAnimationFrame(render);
  }

  // Handle visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !animationFrameId && !prefersReducedMotion()) {
      animationFrameId = requestAnimationFrame(render);
    }
  });

  animationFrameId = requestAnimationFrame(render);
}

/* ==========================================================================
   Header Giant Cookie Bite & Crumb Mechanics
   ========================================================================== */
function initGiantCookie() {
  const btn = elements.giantCookieBtn;
  const speech = elements.cookieSpeech;
  const cutout = elements.cookieBitesCutout;
  if (!btn || !cutout) return;

  // Bite coordinates (circles subtracted from cookie)
  const biteLocations = [
    { cx: 88, cy: 30, r: 24 },
    { cx: 95, cy: 62, r: 26 },
    { cx: 78, cy: 92, r: 22 },
    { cx: 58, cy: 55, r: 26 }
  ];

  const speechNom = [
    'om nom! 🍪',
    'om nom ×2 😋',
    'om nom ×3 🤤',
    'om nom ×4 ✨',
    'Fresh batch! ♨️'
  ];

  btn.addEventListener('click', (e) => {
    state.bitesCount++;
    const currentBite = state.bitesCount % (biteLocations.length + 1);

    // Wobble chomp animation
    btn.classList.remove('chomp');
    void btn.offsetWidth; // trigger reflow
    btn.classList.add('chomp');

    // Spawn flying crumb particles around the cookie
    spawnCrumbBurst(btn);

    if (currentBite === 0) {
      // Regenerate!
      cutout.innerHTML = '';
      if (speech) {
        speech.textContent = 'Fresh batch! ♨️';
        speech.style.display = 'block';
      }
    } else {
      // Add bite mark circle
      const bite = biteLocations[currentBite - 1];
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', bite.cx);
      circle.setAttribute('cy', bite.cy);
      circle.setAttribute('r', bite.r);
      circle.setAttribute('fill', 'black');
      cutout.appendChild(circle);

      if (speech) {
        speech.textContent = speechNom[currentBite - 1] || 'om nom!';
        speech.style.display = 'block';
      }
    }
  });
}

function spawnCrumbBurst(targetElement) {
  if (prefersReducedMotion()) return;
  const rect = targetElement.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const count = 10;
  for (let i = 0; i < count; i++) {
    const crumb = document.createElement('div');
    crumb.className = 'floating-pop-cookie';
    crumb.textContent = Math.random() > 0.4 ? '🍪' : '✨';
    crumb.style.fontSize = `${0.75 + Math.random() * 0.75}rem`;
    crumb.style.left = `${centerX}px`;
    crumb.style.top = `${centerY}px`;

    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 70;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;

    crumb.style.setProperty('--tx', `${tx}px`);
    crumb.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`);
    crumb.style.transform = `translate(${tx * 0.2}px, ${ty * 0.2}px)`;

    document.body.appendChild(crumb);
    setTimeout(() => crumb.remove(), 700);
  }
}

/* ==========================================================================
   Confetti & Cookie Rain on #1 Podium Spot Click
   ========================================================================== */
function launchPodiumCelebration(originX, originY) {
  if (prefersReducedMotion()) return;

  const items = ['🍪', '👑', '⭐', '✨', '🎉', '🍪'];
  const particleCount = 42;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('div');
    p.className = 'floating-pop-cookie';
    p.textContent = items[Math.floor(Math.random() * items.length)];
    p.style.fontSize = `${1 + Math.random() * 1.3}rem`;
    p.style.left = `${originX || window.innerWidth / 2}px`;
    p.style.top = `${originY || window.innerHeight / 3}px`;

    const spreadX = (Math.random() - 0.5) * 500;
    const spreadY = -120 - Math.random() * 200;

    p.style.setProperty('--tx', `${spreadX}px`);
    p.style.setProperty('--rot', `${(Math.random() - 0.5) * 360}deg`);

    p.animate([
      { transform: 'translate(0, 0) scale(0.6)', opacity: 1 },
      { transform: `translate(${spreadX * 0.5}px, ${spreadY}px) scale(1.3)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${spreadX}px, ${spreadY + 500}px) scale(0.9) rotate(${(Math.random() - 0.5) * 500}deg)`, opacity: 0 }
    ], {
      duration: 1800 + Math.random() * 800,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    }).onfinish = () => p.remove();

    document.body.appendChild(p);
  }
}

/* ==========================================================================
   Smooth Count-up Animation for Numbers
   ========================================================================== */
function animateValue(element, start, end, duration = 800) {
  if (!element) return;
  if (start === end || prefersReducedMotion()) {
    element.textContent = end.toLocaleString();
    return;
  }

  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Out-cubic easing
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (end - start) * eased);
    element.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = end.toLocaleString();
    }
  }
  requestAnimationFrame(update);
}

/* ==========================================================================
   Render Stats Strip
   ========================================================================== */
function renderStats(data) {
  const totalCookies = data.people.reduce((sum, p) => sum + p.cookies, 0);
  const totalCollectors = data.people.length;

  const prevTotal = Number(elements.statTotalCookies.dataset.value) || 0;
  const prevCollectors = Number(elements.statCollectors.dataset.value) || 0;

  animateValue(elements.statTotalCookies, prevTotal, totalCookies);
  animateValue(elements.statCollectors, prevCollectors, totalCollectors);

  elements.statTotalCookies.dataset.value = totalCookies;
  elements.statCollectors.dataset.value = totalCollectors;

  elements.statLastUpdated.textContent = formatRelativeTime(data.updatedAt);
}

/* ==========================================================================
   Render Podium (Top 3)
   ========================================================================== */
function renderPodium(rankedPeople) {
  const container = elements.podiumContainer;
  container.innerHTML = '';

  if (rankedPeople.length === 0) {
    elements.podiumSection.style.display = 'none';
    return;
  }

  elements.podiumSection.style.display = 'block';

  // Take top 3
  const topPeople = rankedPeople.slice(0, 3);

  // We assign visual display order:
  // rank 1 (pedestal-1), rank 2 (pedestal-2), rank 3 (pedestal-3)
  topPeople.forEach((person, index) => {
    const rankNum = person.rank; // actual rank (e.g. 1, 2, or 3)
    const slotIndex = index + 1; // 1, 2, 3

    const slot = document.createElement('div');
    slot.className = `podium-slot rank-${slotIndex}`;
    slot.setAttribute('tabindex', slotIndex === 1 ? '0' : '-1');
    slot.setAttribute('role', 'group');
    slot.setAttribute('aria-label', `Rank ${rankNum}: ${person.name}, ${person.cookies} cookies`);

    // Crown for #1
    if (slotIndex === 1) {
      const crown = document.createElement('div');
      crown.className = 'podium-crown';
      crown.textContent = '👑';
      crown.setAttribute('aria-hidden', 'true');
      slot.appendChild(crown);

      // Add click handler for celebration
      const triggerCelebration = (e) => {
        const rect = slot.getBoundingClientRect();
        launchPodiumCelebration(rect.left + rect.width / 2, rect.top + 40);
      };
      slot.addEventListener('click', triggerCelebration);
      slot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerCelebration(e);
        }
      });
    }

    // Avatar
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar-badge-wrap';

    const avatar = document.createElement('div');
    avatar.className = 'podium-avatar';
    avatar.textContent = person.emoji;
    avatarWrap.appendChild(avatar);
    slot.appendChild(avatarWrap);

    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'podium-name';
    nameEl.textContent = person.name;
    nameEl.title = person.name;
    slot.appendChild(nameEl);

    // Rank title tag
    const titleTag = document.createElement('div');
    titleTag.className = 'podium-title-tag';
    titleTag.textContent = getRankTitle(person.cookies);
    slot.appendChild(titleTag);

    // Cookies count
    const cookiesEl = document.createElement('div');
    cookiesEl.className = 'podium-cookies';
    const cookieNumSpan = document.createElement('span');
    cookieNumSpan.textContent = person.cookies.toLocaleString();
    const cookieIconSpan = document.createElement('span');
    cookieIconSpan.textContent = '🍪';
    cookiesEl.appendChild(cookieNumSpan);
    cookiesEl.appendChild(cookieIconSpan);
    slot.appendChild(cookiesEl);

    // Pedestal
    const pedestal = document.createElement('div');
    pedestal.className = `pedestal pedestal-${slotIndex}`;
    const rankNumEl = document.createElement('span');
    rankNumEl.className = 'pedestal-rank-num';
    rankNumEl.textContent = `#${rankNum}`;
    pedestal.appendChild(rankNumEl);
    slot.appendChild(pedestal);

    container.appendChild(slot);
  });
}

/* ==========================================================================
   Render Leaderboard List (All Ranks)
   ========================================================================== */
function renderList(rankedPeople) {
  const list = elements.leaderboardList;
  list.innerHTML = '';

  if (rankedPeople.length === 0) {
    elements.leaderboardSection.style.display = 'none';
    return;
  }

  elements.leaderboardSection.style.display = 'block';

  const leaderCookies = rankedPeople[0]?.cookies || 1;

  rankedPeople.forEach((person, index) => {
    const row = document.createElement('li');
    row.className = 'leaderboard-row';
    row.setAttribute('role', 'listitem');
    row.setAttribute('tabindex', '0');
    row.style.setProperty('--row-index', index);

    // Rank badge
    const badge = document.createElement('div');
    badge.className = `rank-badge rank-${person.rank}`;
    if (person.rank === 1) badge.textContent = '🥇';
    else if (person.rank === 2) badge.textContent = '🥈';
    else if (person.rank === 3) badge.textContent = '🥉';
    else badge.textContent = person.rank;
    row.appendChild(badge);

    // Emoji
    const emoji = document.createElement('div');
    emoji.className = 'row-emoji';
    emoji.textContent = person.emoji;
    row.appendChild(emoji);

    // Info (Name, Title, Progress Bar)
    const info = document.createElement('div');
    info.className = 'row-info';

    const header = document.createElement('div');
    header.className = 'row-header';

    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = person.name;
    header.appendChild(name);

    const title = document.createElement('span');
    title.className = 'row-rank-title';
    title.textContent = getRankTitle(person.cookies);
    header.appendChild(title);

    info.appendChild(header);

    // Progress bar relative to leader
    const barWrap = document.createElement('div');
    barWrap.className = 'row-bar-wrap';

    const barFill = document.createElement('div');
    barFill.className = 'row-bar-fill';
    const percent = leaderCookies > 0 ? Math.min(100, Math.round((person.cookies / leaderCookies) * 100)) : 0;
    barFill.style.width = `${percent}%`;
    barWrap.appendChild(barFill);
    info.appendChild(barWrap);

    row.appendChild(info);

    // Cookies count
    const countWrap = document.createElement('div');
    countWrap.className = 'row-count-wrap';

    const count = document.createElement('div');
    count.className = 'row-count';

    const countNum = document.createElement('span');
    const prevCookies = state.previousPeopleMap.get(person.id);
    if (prevCookies !== undefined && prevCookies !== person.cookies) {
      animateValue(countNum, prevCookies, person.cookies, 600);
    } else {
      countNum.textContent = person.cookies.toLocaleString();
    }

    const countIcon = document.createElement('span');
    countIcon.className = 'row-count-icon';
    countIcon.textContent = '🍪';

    count.appendChild(countNum);
    count.appendChild(countIcon);
    countWrap.appendChild(count);
    row.appendChild(countWrap);

    // Interactive wiggle & pop mini cookies on hover / tap
    const triggerWiggle = (e) => {
      row.classList.remove('wiggle');
      void row.offsetWidth;
      row.classList.add('wiggle');

      // Pop mini cookies
      if (!prefersReducedMotion()) {
        const clientX = e.clientX || row.getBoundingClientRect().left + 80;
        const clientY = e.clientY || row.getBoundingClientRect().top + 20;

        for (let i = 0; i < 3; i++) {
          const mini = document.createElement('div');
          mini.className = 'floating-pop-cookie';
          mini.textContent = person.emoji || '🍪';
          mini.style.left = `${clientX + (i - 1) * 20}px`;
          mini.style.top = `${clientY}px`;
          mini.style.setProperty('--tx', `${(Math.random() - 0.5) * 60}px`);
          mini.style.setProperty('--rot', `${(Math.random() - 0.5) * 40}deg`);
          document.body.appendChild(mini);
          setTimeout(() => mini.remove(), 700);
        }
      }
    };

    row.addEventListener('mouseenter', triggerWiggle);
    row.addEventListener('click', triggerWiggle);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerWiggle(e);
      }
    });

    list.appendChild(row);
  });
}

/* ==========================================================================
   Render Recent Crumbs Ticker
   ========================================================================== */
function renderTicker(log) {
  const track = elements.tickerTrack;
  track.innerHTML = '';

  if (!log || log.length === 0) {
    elements.tickerSection.style.display = 'none';
    return;
  }

  elements.tickerSection.style.display = 'flex';

  // Duplicate items if short to ensure smooth continuous marquee
  const itemsToRender = log.length < 6 ? [...log, ...log, ...log] : [...log, ...log];

  itemsToRender.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'ticker-item';

    const isPos = entry.delta >= 0;
    const deltaBadge = document.createElement('span');
    deltaBadge.className = `ticker-delta ${isPos ? 'pos' : 'neg'}`;
    deltaBadge.textContent = `${isPos ? '+' : ''}${entry.delta} 🍪`;
    item.appendChild(deltaBadge);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `for ${entry.name}`;
    item.appendChild(nameSpan);

    if (entry.delta < 0) {
      const hungrySpan = document.createElement('span');
      hungrySpan.className = 'ticker-time';
      hungrySpan.textContent = '(someone got hungry)';
      item.appendChild(hungrySpan);
    }

    const dot = document.createElement('span');
    dot.textContent = '·';
    item.appendChild(dot);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'ticker-time';
    timeSpan.textContent = formatRelativeTime(entry.at);
    item.appendChild(timeSpan);

    track.appendChild(item);
  });
}

/* ==========================================================================
   Fetch & Render Leaderboard Data
   ========================================================================== */
async function fetchLeaderboard() {
  if (state.isFetching) return;
  state.isFetching = true;

  try {
    const response = await fetch(`data/leaderboard.json?t=${Date.now()}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const raw = await response.json();
    const normalized = normalizeData(raw);

    // Save previous counts for count-up animation
    if (state.data && state.data.people) {
      state.previousPeopleMap.clear();
      for (const p of state.data.people) {
        state.previousPeopleMap.set(p.id, p.cookies);
      }
    }

    state.data = normalized;
    updateUI(normalized);
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    if (!state.data) {
      showError();
    }
  } finally {
    state.isFetching = false;
  }
}

function updateUI(data) {
  // Hide loading & error states
  elements.loadingState.style.display = 'none';
  elements.errorState.style.display = 'none';

  if (data.people.length === 0) {
    elements.emptyState.style.display = 'block';
    elements.mainContent.style.display = 'none';
    renderStats(data);
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.mainContent.style.display = 'block';

  const rankedPeople = computeRankings(data.people);

  renderStats(data);
  renderPodium(rankedPeople);
  renderList(rankedPeople);
  renderTicker(data.log);
}

function showError() {
  elements.loadingState.style.display = 'none';
  elements.emptyState.style.display = 'none';
  elements.mainContent.style.display = 'none';
  elements.errorState.style.display = 'block';
}

/* ==========================================================================
   Auto-Refresh & Lifecycle
   ========================================================================== */
function setupAutoRefresh() {
  // Refresh every 60s while visible
  state.refreshTimer = setInterval(() => {
    if (!document.hidden) {
      fetchLeaderboard();
    }
  }, 60000);

  // Update relative timestamps every 30s
  state.relativeTimeTimer = setInterval(() => {
    if (state.data && !document.hidden) {
      elements.statLastUpdated.textContent = formatRelativeTime(state.data.updatedAt);
    }
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchLeaderboard();
    }
  });
}

/* ==========================================================================
   Initialization
   ========================================================================== */
function init() {
  initBackgroundParticles();
  initGiantCookie();

  if (elements.retryBtn) {
    elements.retryBtn.addEventListener('click', () => {
      elements.errorState.style.display = 'none';
      elements.loadingState.style.display = 'block';
      fetchLeaderboard();
    });
  }

  setupAutoRefresh();
  fetchLeaderboard();
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
