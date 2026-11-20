/**
 * Cookie Leaderboard - Admin App Script
 * Vanilla JS, GitHub Contents API writes, draft editing, log collapsing
 */

import {
  CONSTANTS,
  normalizeData,
  computeRankings,
  getRankTitle,
  generatePersonId,
  utf8ToBase64,
  base64ToUtf8,
  loadAdminSettings,
  saveAdminSettings,
  clearAdminSettings,
  formatRelativeTime
} from './shared.js';

// Application State
const state = {
  settings: loadAdminSettings(),
  sha: null,
  pristineData: null,
  draftData: null,
  dirtyCount: 0,
  isSaving: false,
  isLoading: false,
  sessionLogEntries: new WeakSet(), // log entries created since the last load/save (only these may be collapsed)
  activeEmojiTarget: null // personId or 'addForm'
};

// DOM References
const elements = {
  // Settings
  settingsPanel: document.getElementById('settingsPanel'),
  settingsForm: document.getElementById('settingsForm'),
  inputOwner: document.getElementById('inputOwner'),
  inputRepo: document.getElementById('inputRepo'),
  inputBranch: document.getElementById('inputBranch'),
  inputPath: document.getElementById('inputPath'),
  inputToken: document.getElementById('inputToken'),
  checkRemember: document.getElementById('checkRemember'),
  btnForgetToken: document.getElementById('btnForgetToken'),

  // Status & Toolbar
  dirtyIndicator: document.getElementById('dirtyIndicator'),
  dirtyText: document.getElementById('dirtyText'),
  btnDiscard: document.getElementById('btnDiscard'),
  btnSave: document.getElementById('btnSave'),
  statusText: document.getElementById('statusText'),

  // Add Person Form
  addPersonForm: document.getElementById('addPersonForm'),
  addNameInput: document.getElementById('addNameInput'),
  addEmojiBtn: document.getElementById('addEmojiBtn'),
  addEmojiValue: document.getElementById('addEmojiValue'),
  addCookiesInput: document.getElementById('addCookiesInput'),

  // People List
  peopleList: document.getElementById('adminPeopleList'),
  emptyNotice: document.getElementById('emptyNotice'),

  // Emoji Popover
  emojiPopover: document.getElementById('emojiPopover'),
  emojiGrid: document.getElementById('emojiGrid'),
  emojiCustomInput: document.getElementById('emojiCustomInput'),
  emojiApplyCustomBtn: document.getElementById('emojiApplyCustomBtn'),

  // Toast Container
  toastContainer: document.getElementById('toastContainer')
};

/* ==========================================================================
   Toast Notification System
   ========================================================================== */
function showToast(message, type = 'info', duration = 4000) {
  if (!elements.toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');

  let icon = 'ℹ️';
  if (type === 'success') icon = '🎉';
  if (type === 'error') icon = '⚠️';
  if (type === 'warning') icon = '🍪';

  const iconSpan = document.createElement('span');
  iconSpan.textContent = icon;
  toast.appendChild(iconSpan);

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

/* ==========================================================================
   Confetti & Cookie Burst on Save
   ========================================================================== */
function launchSaveCelebration() {
  const items = ['🍪', '✨', '🎉', '🌟', '🍪'];
  for (let i = 0; i < 35; i++) {
    const p = document.createElement('div');
    p.className = 'floating-pop-cookie';
    p.textContent = items[Math.floor(Math.random() * items.length)];
    p.style.fontSize = `${1.2 + Math.random() * 1}rem`;
    p.style.left = `${window.innerWidth / 2}px`;
    p.style.top = `${window.innerHeight / 2}px`;

    const spreadX = (Math.random() - 0.5) * 600;
    const spreadY = -150 - Math.random() * 200;

    p.style.setProperty('--tx', `${spreadX}px`);
    p.style.setProperty('--rot', `${(Math.random() - 0.5) * 360}deg`);

    p.animate([
      { transform: 'translate(0, 0) scale(0.6)', opacity: 1 },
      { transform: `translate(${spreadX * 0.5}px, ${spreadY}px) scale(1.2)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${spreadX}px, ${spreadY + 450}px) scale(0.8) rotate(${(Math.random() - 0.5) * 500}deg)`, opacity: 0 }
    ], {
      duration: 1600 + Math.random() * 600,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    }).onfinish = () => p.remove();

    document.body.appendChild(p);
  }
}

/* ==========================================================================
   Settings Management
   ========================================================================== */
function initSettings() {
  const s = state.settings;
  elements.inputOwner.value = s.owner || CONSTANTS.DEFAULT_REPO.owner;
  elements.inputRepo.value = s.repo || CONSTANTS.DEFAULT_REPO.repo;
  elements.inputBranch.value = s.branch || CONSTANTS.DEFAULT_REPO.branch;
  elements.inputPath.value = s.path || CONSTANTS.DEFAULT_REPO.path;
  elements.inputToken.value = s.token || '';
  elements.checkRemember.checked = s.remember !== false;

  // If no token is configured, open the settings drawer automatically
  if (!s.token) {
    elements.settingsPanel.open = true;
  }

  // Save settings on form submit
  elements.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.settings = {
      owner: elements.inputOwner.value.trim() || CONSTANTS.DEFAULT_REPO.owner,
      repo: elements.inputRepo.value.trim() || CONSTANTS.DEFAULT_REPO.repo,
      branch: elements.inputBranch.value.trim() || CONSTANTS.DEFAULT_REPO.branch,
      path: elements.inputPath.value.trim() || CONSTANTS.DEFAULT_REPO.path,
      token: elements.inputToken.value.trim(),
      remember: elements.checkRemember.checked
    };

    saveAdminSettings(state.settings, state.settings.remember);
    if (state.dirtyCount > 0 && !confirm('Connecting reloads the data from GitHub and discards your unsaved changes. Continue?')) {
      return;
    }
    showToast('Settings saved. Connecting to GitHub...', 'success');
    loadData();
  });

  // Forget Token button
  elements.btnForgetToken.addEventListener('click', () => {
    if (confirm('Clear saved token from this device?')) {
      clearAdminSettings();
      state.settings.token = '';
      elements.inputToken.value = '';
      elements.settingsPanel.open = true;
      showToast('Token cleared from storage', 'info');
    }
  });
}

/* ==========================================================================
   Load Data from GitHub Contents API
   ========================================================================== */
async function loadData() {
  if (state.isLoading) return;
  state.isLoading = true;
  updateStatus('Connecting to GitHub...');

  const { owner, repo, branch, path, token } = state.settings;

  if (!token) {
    // If no token, attempt to load local file preview if available
    try {
      const localRes = await fetch(`../${path}?t=${Date.now()}`);
      if (localRes.ok) {
        const raw = await localRes.json();
        const data = normalizeData(raw);
        setData(data, null);
        updateStatus(`Viewing local preview (${path}). Enter token to save.`);
        showToast('Viewing local draft. Add your token in Settings to save changes.', 'info');
        state.isLoading = false;
        return;
      }
    } catch {
      // Fallback empty
    }

    const empty = normalizeData(null);
    setData(empty, null);
    updateStatus('No GitHub token set. Enter token above to load & save.');
    state.isLoading = false;
    return;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-API-Version': '2022-11-28'
      }
    });

    if (res.status === 200) {
      const body = await res.json();
      const decoded = base64ToUtf8(body.content);
      const raw = JSON.parse(decoded);
      const data = normalizeData(raw);

      setData(data, body.sha);
      updateStatus(`Connected to ${owner}/${repo}@${branch}`);
      showToast('Loaded latest data from GitHub!', 'success');
    } else if (res.status === 404) {
      const empty = normalizeData(null);
      setData(empty, null);
      updateStatus(`File does not exist yet (${path}). Will create on save.`);
      showToast('File not found on GitHub. Saving will create it.', 'info');
    } else if (res.status === 401 || res.status === 403) {
      elements.settingsPanel.open = true;
      updateStatus('Authentication error: check token permissions');
      showToast('Token invalid or lacks Contents write permission', 'error');
    } else {
      updateStatus(`GitHub error: HTTP ${res.status}`);
      showToast(`GitHub API responded with status ${res.status}`, 'error');
    }
  } catch (err) {
    console.error('Failed to load data:', err);
    updateStatus('Network error: Unable to reach GitHub');
    showToast('Network error: Unable to reach GitHub. Check your internet.', 'error');
  } finally {
    state.isLoading = false;
  }
}

function setData(data, sha) {
  state.sha = sha;
  state.pristineData = JSON.parse(JSON.stringify(data));
  state.draftData = JSON.parse(JSON.stringify(data));
  state.dirtyCount = 0;
  state.sessionLogEntries = new WeakSet();
  updateDirtyUI();
  renderPeopleList();
}

function updateStatus(text) {
  if (elements.statusText) {
    elements.statusText.textContent = text;
  }
}

/* ==========================================================================
   Dirty Tracking & UI
   ========================================================================== */
function markDirty() {
  state.dirtyCount++;
  updateDirtyUI();
}

function updateDirtyUI() {
  const isDirty = state.dirtyCount > 0;

  if (isDirty) {
    elements.dirtyIndicator.classList.add('is-dirty');
    elements.dirtyText.textContent = `● Unsaved changes (${state.dirtyCount})`;
    elements.btnDiscard.disabled = false;
    elements.btnSave.disabled = false;
  } else {
    elements.dirtyIndicator.classList.remove('is-dirty');
    elements.dirtyText.textContent = 'All changes saved ✓';
    elements.btnDiscard.disabled = true;
    elements.btnSave.disabled = false;
  }
}

// Warn before navigating away if unsaved
window.addEventListener('beforeunload', (e) => {
  if (state.dirtyCount > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ==========================================================================
   Editing Mechanics & Log Collapsing
   ========================================================================== */
/**
 * Applies a cookie delta to a person, clamps cookies >= 0,
 * and collapses consecutive changes to the same person into one log entry.
 */
function applyCookieDelta(personId, requestedDelta) {
  const person = state.draftData.people.find(p => p.id === personId);
  if (!person) return;

  const currentCookies = person.cookies;
  let actualDelta = requestedDelta;

  if (currentCookies + requestedDelta < 0) {
    actualDelta = -currentCookies;
    person.cookies = 0;
    showToast("Can't have negative cookies! The jar is bottomed out 🍪", 'warning');
  } else {
    person.cookies += requestedDelta;
  }

  if (actualDelta === 0) return;

  // Log update: collapse consecutive changes to the same person
  const now = new Date().toISOString();
  person.updatedAt = now;

  const log = state.draftData.log;
  // Only collapse into an entry made in this unsaved session, never into already-published history
  if (log.length > 0 && log[0].personId === person.id && state.sessionLogEntries.has(log[0])) {
    // Consecutive change to same person: update existing entry delta
    log[0].delta += actualDelta;
    log[0].name = person.name;
    log[0].at = now;
  } else {
    // New log entry at front
    const entry = { at: now, personId: person.id, name: person.name, delta: actualDelta };
    state.sessionLogEntries.add(entry);
    log.unshift(entry);
    // Keep at most 50 entries
    if (log.length > CONSTANTS.MAX_LOG_ENTRIES) {
      log.length = CONSTANTS.MAX_LOG_ENTRIES;
    }
  }

  markDirty();
  renderPeopleList();
}

/**
 * Updates person name with validation and uniqueness check
 */
function updatePersonName(personId, newName) {
  const person = state.draftData.people.find(p => p.id === personId);
  if (!person) return;

  const trimmed = newName.trim();
  if (!trimmed) {
    showToast('Name cannot be empty', 'error');
    renderPeopleList();
    return;
  }

  if (trimmed.length > 40) {
    showToast('Name must be 40 characters or fewer', 'error');
    renderPeopleList();
    return;
  }

  // Check case-insensitive duplicate against OTHER people
  const duplicate = state.draftData.people.some(
    p => p.id !== personId && p.name.toLowerCase() === trimmed.toLowerCase()
  );

  if (duplicate) {
    showToast(`A baker named "${trimmed}" already exists!`, 'error');
    renderPeopleList();
    return;
  }

  if (person.name !== trimmed) {
    person.name = trimmed;
    person.updatedAt = new Date().toISOString();

    // Update name in log entries for this person
    state.draftData.log.forEach(entry => {
      if (entry.personId === personId) {
        entry.name = trimmed;
      }
    });

    markDirty();
    showToast(`Updated name to ${trimmed}`, 'info');
    renderPeopleList();
  }
}

/**
 * Deletes person with confirm dialog
 */
function deletePerson(personId) {
  const person = state.draftData.people.find(p => p.id === personId);
  if (!person) return;

  if (confirm(`Are you sure you want to remove "${person.name}" from the cookie leaderboard?`)) {
    state.draftData.people = state.draftData.people.filter(p => p.id !== personId);
    markDirty();
    showToast(`Removed ${person.name}`, 'info');
    renderPeopleList();
  }
}

/* ==========================================================================
   Add Person Form
   ========================================================================== */
function initAddPerson() {
  elements.addEmojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPopover('addForm', elements.addEmojiBtn);
  });

  elements.addPersonForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = elements.addNameInput.value.trim();
    if (!name) {
      showToast('Please enter a name', 'error');
      return;
    }

    if (name.length > 40) {
      showToast('Name must be 40 characters or fewer', 'error');
      return;
    }

    // Check case-insensitive duplicate name
    const exists = state.draftData.people.some(
      p => p.name.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      showToast(`A baker named "${name}" already exists!`, 'error');
      return;
    }

    const emoji = elements.addEmojiValue.value.trim() || CONSTANTS.DEFAULT_EMOJI;
    const cookiesInput = parseInt(elements.addCookiesInput.value, 10);
    const cookies = Number.isFinite(cookiesInput) && cookiesInput >= 0 ? cookiesInput : 0;

    const id = generatePersonId();
    const now = new Date().toISOString();

    const newPerson = {
      id,
      name,
      emoji,
      cookies,
      updatedAt: now
    };

    state.draftData.people.push(newPerson);

    // If starting with cookies, add a log entry
    if (cookies > 0) {
      const entry = { at: now, personId: id, name, delta: cookies };
      state.sessionLogEntries.add(entry);
      state.draftData.log.unshift(entry);
      if (state.draftData.log.length > CONSTANTS.MAX_LOG_ENTRIES) {
        state.draftData.log.length = CONSTANTS.MAX_LOG_ENTRIES;
      }
    }

    markDirty();
    showToast(`Added ${name} to the jar! 🍪`, 'success');

    // Reset form
    elements.addNameInput.value = '';
    elements.addCookiesInput.value = '0';
    elements.addEmojiValue.value = CONSTANTS.DEFAULT_EMOJI;
    elements.addEmojiBtn.textContent = CONSTANTS.DEFAULT_EMOJI;

    renderPeopleList();
  });
}

/* ==========================================================================
   Emoji Popover
   ========================================================================== */
function initEmojiPicker() {
  // Populate grid with ~16 fun options
  elements.emojiGrid.innerHTML = '';
  CONSTANTS.EMOJI_OPTIONS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-option';
    btn.textContent = em;
    btn.addEventListener('click', () => {
      applySelectedEmoji(em);
    });
    elements.emojiGrid.appendChild(btn);
  });

  // Custom text input
  elements.emojiApplyCustomBtn.addEventListener('click', () => {
    const custom = elements.emojiCustomInput.value.trim();
    if (custom) {
      applySelectedEmoji(custom);
    }
  });

  elements.emojiCustomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const custom = elements.emojiCustomInput.value.trim();
      if (custom) {
        applySelectedEmoji(custom);
      }
    }
  });

  // Close popover when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.emojiPopover.contains(e.target) && e.target !== elements.emojiPopover) {
      closeEmojiPopover();
    }
  });
}

function openEmojiPopover(target, anchorElement) {
  state.activeEmojiTarget = target;
  elements.emojiCustomInput.value = '';

  const rect = anchorElement.getBoundingClientRect();
  elements.emojiPopover.style.display = 'flex';
  elements.emojiPopover.style.position = 'absolute';
  elements.emojiPopover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  elements.emojiPopover.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 270)}px`;
}

function closeEmojiPopover() {
  elements.emojiPopover.style.display = 'none';
  state.activeEmojiTarget = null;
}

function applySelectedEmoji(emoji) {
  if (!state.activeEmojiTarget) return;

  if (state.activeEmojiTarget === 'addForm') {
    elements.addEmojiValue.value = emoji;
    elements.addEmojiBtn.textContent = emoji;
  } else {
    // Person ID
    const person = state.draftData.people.find(p => p.id === state.activeEmojiTarget);
    if (person && person.emoji !== emoji) {
      person.emoji = emoji;
      person.updatedAt = new Date().toISOString();
      markDirty();
      renderPeopleList();
    }
  }

  closeEmojiPopover();
}

/* ==========================================================================
   Render People List (Sorted like public page)
   ========================================================================== */
function renderPeopleList() {
  const container = elements.peopleList;
  container.innerHTML = '';

  if (!state.draftData || state.draftData.people.length === 0) {
    elements.emptyNotice.style.display = 'block';
    return;
  }

  elements.emptyNotice.style.display = 'none';

  const ranked = computeRankings(state.draftData.people);

  ranked.forEach(person => {
    const card = document.createElement('div');
    card.className = 'person-admin-card';

    // Rank badge
    const rankEl = document.createElement('div');
    rankEl.className = 'person-rank-badge';
    rankEl.textContent = `#${person.rank}`;
    card.appendChild(rankEl);

    // Emoji picker button
    const emojiBtn = document.createElement('button');
    emojiBtn.type = 'button';
    emojiBtn.className = 'emoji-picker-btn';
    emojiBtn.textContent = person.emoji;
    emojiBtn.title = 'Change emoji avatar';
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEmojiPopover(person.id, emojiBtn);
    });
    card.appendChild(emojiBtn);

    // Name input (editable inline)
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'person-name-edit';
    nameInput.value = person.name;
    nameInput.setAttribute('value', person.name);
    nameInput.maxLength = 40;
    nameInput.title = 'Edit baker name';
    nameInput.addEventListener('change', (e) => {
      updatePersonName(person.id, e.target.value);
    });
    card.appendChild(nameInput);

    // Cookie count badge
    const countBadge = document.createElement('div');
    countBadge.className = 'person-cookie-count-badge';
    const countNum = document.createElement('span');
    countNum.textContent = person.cookies.toLocaleString();
    const countIcon = document.createElement('span');
    countIcon.textContent = '🍪';
    countBadge.appendChild(countNum);
    countBadge.appendChild(countIcon);
    card.appendChild(countBadge);

    // Quick Actions & Custom Delta
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'person-actions-quick';

    // Quick buttons: -1, +1, +5, +10
    const deltas = [-1, 1, 5, 10];
    deltas.forEach(d => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-quick';
      btn.textContent = d > 0 ? `+${d}` : `${d}`;
      btn.addEventListener('click', () => {
        applyCookieDelta(person.id, d);
      });
      actionsWrap.appendChild(btn);
    });

    // Custom Delta Input (+/- integer)
    const customForm = document.createElement('form');
    customForm.className = 'custom-delta-form';
    customForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = parseInt(customInput.value, 10);
      if (Number.isInteger(val) && val !== 0) {
        applyCookieDelta(person.id, val);
        customInput.value = '';
      }
    });

    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.placeholder = '±';
    customInput.className = 'input-custom-delta';
    customInput.title = 'Enter custom +/- amount and apply';
    customForm.appendChild(customInput);

    const customApplyBtn = document.createElement('button');
    customApplyBtn.type = 'submit';
    customApplyBtn.className = 'btn-apply-delta';
    customApplyBtn.textContent = 'Apply';
    customForm.appendChild(customApplyBtn);

    actionsWrap.appendChild(customForm);

    // Delete Button
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-delete-person';
    delBtn.textContent = '🗑️ Delete';
    delBtn.title = `Remove ${person.name}`;
    delBtn.addEventListener('click', () => {
      deletePerson(person.id);
    });
    actionsWrap.appendChild(delBtn);

    card.appendChild(actionsWrap);
    container.appendChild(card);
  });
}

/* ==========================================================================
   Discard Changes
   ========================================================================== */
function initDiscard() {
  elements.btnDiscard.addEventListener('click', () => {
    if (confirm('Discard all unsaved changes and reload from GitHub?')) {
      showToast('Discarding changes...', 'info');
      if (state.pristineData) {
        state.draftData = JSON.parse(JSON.stringify(state.pristineData));
        state.dirtyCount = 0;
        updateDirtyUI();
        renderPeopleList();
      }
      loadData();
    }
  });
}

/* ==========================================================================
   Save to GitHub Contents API
   ========================================================================== */
function initSave() {
  elements.btnSave.addEventListener('click', async () => {
    if (state.isSaving) return;

    const { owner, repo, branch, path, token } = state.settings;

    if (!token) {
      showToast('Please enter a GitHub Personal Access Token in Settings to save', 'error');
      elements.settingsPanel.open = true;
      return;
    }

    state.isSaving = true;
    elements.btnSave.disabled = true;
    const originalText = elements.btnSave.innerHTML;
    elements.btnSave.innerHTML = '<span>⏳</span> Saving to GitHub...';

    try {
      // 1. Prepare payload
      state.draftData.updatedAt = new Date().toISOString();
      const jsonString = JSON.stringify(state.draftData, null, 2) + '\n';
      const base64Content = utf8ToBase64(jsonString);

      // Create a short descriptive summary
      // Summarise only this session's cookie changes (renames/deletes have no log entry)
      const sessionEntries = state.draftData.log.filter(e => state.sessionLogEntries.has(e));
      let summary = 'edit bakers';
      if (sessionEntries.length > 0) {
        const parts = sessionEntries.slice(0, 3).map(e => `${e.delta >= 0 ? '+' : ''}${e.delta} ${e.name}`);
        const more = sessionEntries.length - parts.length;
        summary = parts.join(', ') + (more > 0 ? ` and ${more} more` : '');
      }

      const bodyPayload = {
        message: `Update cookies: ${summary}`,
        content: base64Content,
        branch
      };

      // Only send sha if file already exists
      if (state.sha) {
        bodyPayload.sha = state.sha;
      }

      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-API-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      });

      if (res.status === 200 || res.status === 201) {
        const resData = await res.json();
        state.sha = resData.content?.sha || resData.sha;
        state.pristineData = JSON.parse(JSON.stringify(state.draftData));
        state.dirtyCount = 0;
        state.sessionLogEntries = new WeakSet(); // saved entries are now published history
        updateDirtyUI();

        showToast('Saved to GitHub! Live site updates in ~1 minute 🍪', 'success', 6000);
        launchSaveCelebration();
      } else if (res.status === 409 || res.status === 422) {
        showToast('Conflict: Someone else modified the leaderboard. You can reload from GitHub to discard draft.', 'error', 6000);
      } else if (res.status === 401 || res.status === 403) {
        showToast('Token invalid or lacks Contents write permission', 'error');
        elements.settingsPanel.open = true;
      } else {
        showToast(`Save failed: HTTP ${res.status}`, 'error');
      }
    } catch (err) {
      console.error('Error saving to GitHub:', err);
      showToast('Network error: Unable to connect to GitHub API.', 'error');
    } finally {
      state.isSaving = false;
      elements.btnSave.disabled = false;
      elements.btnSave.innerHTML = originalText;
    }
  });
}

/* ==========================================================================
   Initialization
   ========================================================================== */
function init() {
  initSettings();
  initAddPerson();
  initEmojiPicker();
  initDiscard();
  initSave();

  // Load initial data
  loadData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
