/**
 * Shared helpers for Cookie Leaderboard
 * Constants, data validation, ranking calculation, text formatting
 */

export const CONSTANTS = {
  VERSION: 1,
  DEFAULT_EMOJI: '🍪',
  DEFAULT_REPO: {
    owner: 'opencode-fast',
    repo: 'cookies.johannes-nirschl.tech',
    branch: 'main',
    path: 'data/leaderboard.json',
  },
  STORAGE_KEY: 'cookieAdmin.settings',
  MAX_LOG_ENTRIES: 50,
  EMOJI_OPTIONS: [
    '🍪', '🧁', '🍩', '🍫', '🍰', '🥧', '🍬', '🍭',
    '🍮', '🍯', '🥛', '☕', '🦝', '👾', '🐸', '🐻'
  ]
};

/**
 * Escapes HTML characters for safe string rendering
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Determines rank title based on cookie count
 */
export function getRankTitle(cookies) {
  const count = Math.max(0, Math.floor(Number(cookies) || 0));
  if (count === 0) return 'Crumb Seeker';
  if (count <= 4) return 'Nibbler';
  if (count <= 9) return 'Snack Apprentice';
  if (count <= 24) return 'Cookie Connoisseur';
  if (count <= 49) return 'Dough Master';
  if (count <= 99) return 'Biscuit Baron';
  return 'Cookie Monarch';
}

/**
 * Generates a unique person ID: p- + random base36
 */
export function generatePersonId() {
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).substring(2, 7);
  return `p-${timePart}${randPart}`;
}

/**
 * Tolerates missing/invalid fields, drops invalid people, clamps cookies,
 * defaults emoji/log, and never throws on bad shape.
 */
export function normalizeData(raw) {
  const defaultEmpty = {
    version: 1,
    updatedAt: new Date().toISOString(),
    people: [],
    log: []
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultEmpty;
  }

  // Version check
  const version = Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1;

  // UpdatedAt check
  let updatedAt = new Date().toISOString();
  if (typeof raw.updatedAt === 'string') {
    const parsed = Date.parse(raw.updatedAt);
    if (!Number.isNaN(parsed)) {
      updatedAt = new Date(parsed).toISOString();
    }
  }

  // People validation
  const validPeople = [];
  if (Array.isArray(raw.people)) {
    for (const p of raw.people) {
      if (!p || typeof p !== 'object') continue;

      // Validate ID
      const id = typeof p.id === 'string' ? p.id.trim() : '';
      if (!id) continue;

      // Validate Name (1-40 chars trimmed)
      const name = typeof p.name === 'string' ? p.name.trim() : '';
      if (name.length < 1 || name.length > 40) continue;

      // Validate Cookies (integer >= 0)
      const rawCount = Math.floor(Number(p.cookies));
      const cookies = Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0;

      // Validate Emoji
      let emoji = CONSTANTS.DEFAULT_EMOJI;
      if (typeof p.emoji === 'string' && p.emoji.trim()) {
        emoji = p.emoji.trim();
      }

      // Validate updatedAt
      let pUpdatedAt = updatedAt;
      if (typeof p.updatedAt === 'string') {
        const parsedP = Date.parse(p.updatedAt);
        if (!Number.isNaN(parsedP)) {
          pUpdatedAt = new Date(parsedP).toISOString();
        }
      }

      validPeople.push({
        id,
        name,
        emoji,
        cookies,
        updatedAt: pUpdatedAt
      });
    }
  }

  // Log validation (max 50 newest, newest first)
  const validLog = [];
  if (Array.isArray(raw.log)) {
    for (const item of raw.log) {
      if (!item || typeof item !== 'object') continue;

      const personId = typeof item.personId === 'string' ? item.personId.trim() : '';
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!personId || !name) continue;

      const delta = Math.floor(Number(item.delta));
      if (!Number.isFinite(delta)) continue;

      let at = updatedAt;
      if (typeof item.at === 'string') {
        const parsedAt = Date.parse(item.at);
        if (!Number.isNaN(parsedAt)) {
          at = new Date(parsedAt).toISOString();
        }
      }

      validLog.push({
        at,
        personId,
        name,
        delta
      });

      if (validLog.length >= CONSTANTS.MAX_LOG_ENTRIES) {
        break;
      }
    }
  }

  return {
    version,
    updatedAt,
    people: validPeople,
    log: validLog
  };
}

/**
 * Sorts people by cookies desc, then name asc (case-insensitive)
 */
export function sortPeople(people) {
  if (!Array.isArray(people)) return [];
  return [...people].sort((a, b) => {
    if (b.cookies !== a.cookies) {
      return b.cookies - a.cookies;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * Computes ranks with ties sharing the same rank number (1, 1, 3 style)
 */
export function computeRankings(people) {
  const sorted = sortPeople(people);
  let currentRank = 1;

  return sorted.map((person, index) => {
    if (index > 0 && person.cookies < sorted[index - 1].cookies) {
      currentRank = index + 1;
    }
    return {
      ...person,
      rank: currentRank
    };
  });
}

/**
 * Formats ISO date string into human relative time
 */
export function formatRelativeTime(isoString, now = new Date()) {
  if (!isoString) return 'recently';
  const time = Date.parse(isoString);
  if (Number.isNaN(time)) return 'recently';

  const diffMs = now.getTime() - time;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) return 'just now';
  if (diffSec < 90) return '1 min ago';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return '1h ago';
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;

  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Encodes string to UTF-8 base64 ensuring emojis survive
 */
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes UTF-8 base64 string ensuring emojis survive
 */
export function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Safe storage helpers wrapped in try/catch
 */
export function loadAdminSettings() {
  try {
    const local = localStorage.getItem(CONSTANTS.STORAGE_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      return { ...CONSTANTS.DEFAULT_REPO, ...parsed, remember: true };
    }
    const session = sessionStorage.getItem(CONSTANTS.STORAGE_KEY);
    if (session) {
      const parsed = JSON.parse(session);
      return { ...CONSTANTS.DEFAULT_REPO, ...parsed, remember: false };
    }
  } catch (err) {
    console.warn('Could not read storage:', err);
  }
  return { ...CONSTANTS.DEFAULT_REPO, token: '', remember: true };
}

export function saveAdminSettings(settings, remember = true) {
  try {
    const cleanSettings = {
      owner: (settings.owner || CONSTANTS.DEFAULT_REPO.owner).trim(),
      repo: (settings.repo || CONSTANTS.DEFAULT_REPO.repo).trim(),
      branch: (settings.branch || CONSTANTS.DEFAULT_REPO.branch).trim(),
      path: (settings.path || CONSTANTS.DEFAULT_REPO.path).trim(),
      token: (settings.token || '').trim()
    };

    if (remember) {
      localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(cleanSettings));
      sessionStorage.removeItem(CONSTANTS.STORAGE_KEY);
    } else {
      sessionStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(cleanSettings));
      localStorage.removeItem(CONSTANTS.STORAGE_KEY);
    }
    return true;
  } catch (err) {
    console.warn('Could not save settings:', err);
    return false;
  }
}

export function clearAdminSettings() {
  try {
    localStorage.removeItem(CONSTANTS.STORAGE_KEY);
    sessionStorage.removeItem(CONSTANTS.STORAGE_KEY);
    return true;
  } catch (err) {
    console.warn('Could not clear settings:', err);
    return false;
  }
}
