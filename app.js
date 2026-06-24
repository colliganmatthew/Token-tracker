/* ─── STATE ──────────────────────────────────────────────────────── */

const NUM_PLAYERS = 4;

// players[i] = array of token objects
// token: { id, name, typeLine, power, toughness, imageUrl, untapped, tapped }
let players = loadState();
let activePlayer = 0;

// sacrifice modal context
let sacrificeCtx = null; // { playerIdx, tokenId }

/* ─── PERSISTENCE ────────────────────────────────────────────────── */
function loadState() {
  try {
    const saved = localStorage.getItem('mtg-token-tracker-v1');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return [[], [], [], []];
}

function saveState() {
  try {
    localStorage.setItem('mtg-token-tracker-v1', JSON.stringify(players));
  } catch(e) {}
}

/* ─── SCRYFALL SEARCH ─────────────────────────────────────────────── */
let searchTimer = null;

async function searchTokens(query) {
  if (!query || query.length < 2) {
    showSearchHint('Start typing to search Scryfall for token cards.');
    return;
  }

  showSearchLoading();

  try {
    // Search specifically for token cards
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query + ' t:token')}&order=name&unique=cards&include_extras=true`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) {
        showSearchHint('No tokens found. Try a different name.');
        return;
      }
      throw new Error('Scryfall error');
    }
    const data = await res.json();
    renderSearchResults(data.data || []);
  } catch(e) {
    showSearchHint('Search failed. Check your connection and try again.');
  }
}

function showSearchHint(msg) {
  document.getElementById('searchResults').innerHTML =
    `<p class="search-hint">${msg}</p>`;
}

function showSearchLoading() {
  document.getElementById('searchResults').innerHTML =
    `<p class="search-loading">Searching…</p>`;
}

function renderSearchResults(cards) {
  const container = document.getElementById('searchResults');
  if (!cards.length) {
    showSearchHint('No tokens found. Try a different name.');
    return;
  }

  container.innerHTML = '';
  cards.forEach(card => {
    const imageUrl = getCardImageUrl(card);
    const item = document.createElement('div');
    item.className = 'search-result-item';

    const thumb = imageUrl
      ? `<img class="search-thumb" src="${imageUrl}" loading="lazy" alt="${card.name}" onerror="this.style.display='none'" />`
      : `<div class="search-thumb-placeholder">🃏</div>`;

    const power = (card.power && card.toughness)
      ? `<div class="search-result-power">${card.power}/${card.toughness}</div>`
      : '';

    item.innerHTML = `
      ${thumb}
      <div class="search-result-info">
        <div class="search-result-name">${card.name}</div>
        <div class="search-result-type">${card.type_line || ''}</div>
        ${power}
      </div>
    `;

    item.addEventListener('click', () => addTokenToPlayer(activePlayer, card));
    container.appendChild(item);
  });
}

function getCardImageUrl(card) {
  if (card.image_uris) {
    return card.image_uris.art_crop || card.image_uris.small || card.image_uris.normal;
  }
  if (card.card_faces && card.card_faces[0].image_uris) {
    return card.card_faces[0].image_uris.art_crop || card.card_faces[0].image_uris.small;
  }
  return null;
}

/* ─── TOKEN MANAGEMENT ───────────────────────────────────────────── */

function addTokenToPlayer(playerIdx, card) {
  // Check not already added
  const existing = players[playerIdx].find(t => t.name === card.name);
  if (existing) {
    existing.untapped += 1;
    saveState();
    renderTokenList();
    closeSearch();
    return;
  }

  const token = {
    id: Date.now() + Math.random(),
    name: card.name,
    typeLine: card.type_line || '',
    power: card.power || null,
    toughness: card.toughness || null,
    imageUrl: getCardImageUrl(card),
    untapped: 1,
    tapped: 0
  };

  players[playerIdx].push(token);
  saveState();
  renderTokenList();
  closeSearch();
}

function removeToken(playerIdx, tokenId) {
  players[playerIdx] = players[playerIdx].filter(t => t.id !== tokenId);
  saveState();
  renderTokenList();
}

function adjustCount(playerIdx, tokenId, field, delta) {
  const token = players[playerIdx].find(t => t.id === tokenId);
  if (!token) return;
  token[field] = Math.max(0, token[field] + delta);
  saveState();
  renderTokenList();
}

function tapOne(playerIdx, tokenId) {
  const token = players[playerIdx].find(t => t.id === tokenId);
  if (!token || token.untapped === 0) return;
  token.untapped = Math.max(0, token.untapped - 1);
  token.tapped += 1;
  saveState();
  renderTokenList();
}

function sacrificeToken(playerIdx, tokenId) {
  // Show modal to choose tapped or untapped
  const token = players[playerIdx].find(t => t.id === tokenId);
  if (!token) return;

  if (token.untapped === 0 && token.tapped === 0) return;

  // If only one pool has tokens, skip the modal
  if (token.untapped > 0 && token.tapped === 0) {
    token.untapped = Math.max(0, token.untapped - 1);
    saveState();
    renderTokenList();
    return;
  }
  if (token.tapped > 0 && token.untapped === 0) {
    token.tapped = Math.max(0, token.tapped - 1);
    saveState();
    renderTokenList();
    return;
  }

  // Both have tokens — show picker
  sacrificeCtx = { playerIdx, tokenId };
  document.getElementById('sacrificeTitle').textContent =
    `Sacrifice ${token.name} from…`;
  document.getElementById('sacrificeModal').removeAttribute('hidden');
}

function untapAll(playerIdx) {
  players[playerIdx].forEach(token => {
    token.untapped += token.tapped;
    token.tapped = 0;
  });
  saveState();
  renderTokenList();
}

/* ─── RENDER ─────────────────────────────────────────────────────── */

function renderTokenList() {
  const container = document.getElementById('tokenList');
  const tokens = players[activePlayer];

  if (!tokens.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🃏</div>
        <h3>No tokens yet</h3>
        <p>Tap <strong>+ Add Token</strong> to search for a token type to track.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  tokens.forEach(token => {
    const total = token.untapped + token.tapped;
    const card = document.createElement('div');
    card.className = 'token-card';
    card.dataset.id = token.id;

    const art = token.imageUrl
      ? `<img class="token-art" src="${token.imageUrl}" alt="${token.name}" loading="lazy" onerror="this.outerHTML='<div class=\\'token-art-placeholder\\'>🃏</div>'" />`
      : `<div class="token-art-placeholder">🃏</div>`;

    const statLine = (token.power && token.toughness)
      ? ` · ${token.power}/${token.toughness}` : '';

    card.innerHTML = `
      ${art}

      <div class="token-header">
        <span class="token-name">${token.name}</span>
        <span class="token-total">Total: <strong>${total}</strong>${statLine}</span>
      </div>

      <div class="token-controls">
        <!-- UNTAPPED ZONE -->
        <div class="zone untap-zone">
          <span class="zone-label untap">UN<br>TAP</span>
          <button class="btn-adj" data-action="dec-untap" data-id="${token.id}">−</button>
          <span class="zone-count">${token.untapped}</span>
          <button class="btn-adj" data-action="inc-untap" data-id="${token.id}">+</button>
        </div>

        <div class="zone-divider"></div>

        <!-- TAPPED ZONE -->
        <div class="zone tap-zone">
          <button class="btn-adj" data-action="dec-tapped" data-id="${token.id}">−</button>
          <span class="zone-count">${token.tapped}</span>
          <button class="btn-adj" data-action="inc-tapped" data-id="${token.id}">+</button>
          <span class="zone-label tap">TAP<br>PED</span>
        </div>

        <!-- QUICK ACTIONS -->
        <div class="token-actions">
          <button class="btn-tap-token" data-action="tap" data-id="${token.id}">↷ Tap</button>
          <button class="btn-sacrifice" data-action="sacrifice" data-id="${token.id}">✕ Sac</button>
        </div>
      </div>

      <button class="btn-remove-token" data-action="remove" data-id="${token.id}">✕</button>
    `;

    container.appendChild(card);
  });

  // Delegate events
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', handleTokenAction);
  });
}

function handleTokenAction(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;
  const id = parseFloat(el.dataset.id);

  switch (action) {
    case 'dec-untap':   adjustCount(activePlayer, id, 'untapped', -1); break;
    case 'inc-untap':   adjustCount(activePlayer, id, 'untapped', +1); break;
    case 'dec-tapped':  adjustCount(activePlayer, id, 'tapped',   -1); break;
    case 'inc-tapped':  adjustCount(activePlayer, id, 'tapped',   +1); break;
    case 'tap':         tapOne(activePlayer, id); break;
    case 'sacrifice':   sacrificeToken(activePlayer, id); break;
    case 'remove':      removeToken(activePlayer, id); break;
  }
}

function renderPlayerTabs() {
  document.querySelectorAll('.player-tab').forEach(tab => {
    tab.classList.toggle('active', parseInt(tab.dataset.player) === activePlayer);
  });
}

/* ─── SEARCH MODAL ───────────────────────────────────────────────── */

function openSearch() {
  document.getElementById('searchModal').removeAttribute('hidden');
  setTimeout(() => document.getElementById('searchInput').focus(), 50);
}

function closeSearch() {
  document.getElementById('searchModal').setAttribute('hidden', '');
  document.getElementById('searchInput').value = '';
  showSearchHint('Start typing to search Scryfall for token cards.');
}

/* ─── EVENT LISTENERS ────────────────────────────────────────────── */

// Player tabs
document.getElementById('playerTabs').addEventListener('click', e => {
  const tab = e.target.closest('.player-tab');
  if (!tab) return;
  activePlayer = parseInt(tab.dataset.player);
  renderPlayerTabs();
  renderTokenList();
});

// Untap all
document.getElementById('untapAll').addEventListener('click', () => {
  untapAll(activePlayer);
});

// Open/close search
document.getElementById('openSearch').addEventListener('click', openSearch);
document.getElementById('closeSearch').addEventListener('click', closeSearch);
document.getElementById('searchModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSearch();
});

// Search input
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) {
    showSearchHint('Start typing to search Scryfall for token cards.');
    return;
  }
  searchTimer = setTimeout(() => searchTokens(q), 350);
});

// Sacrifice modal
document.getElementById('closeSacrifice').addEventListener('click', () => {
  document.getElementById('sacrificeModal').setAttribute('hidden', '');
  sacrificeCtx = null;
});

document.getElementById('sacrificeUntapped').addEventListener('click', () => {
  if (!sacrificeCtx) return;
  const { playerIdx, tokenId } = sacrificeCtx;
  const token = players[playerIdx].find(t => t.id === tokenId);
  if (token) { token.untapped = Math.max(0, token.untapped - 1); saveState(); renderTokenList(); }
  document.getElementById('sacrificeModal').setAttribute('hidden', '');
  sacrificeCtx = null;
});

document.getElementById('sacrificeTapped').addEventListener('click', () => {
  if (!sacrificeCtx) return;
  const { playerIdx, tokenId } = sacrificeCtx;
  const token = players[playerIdx].find(t => t.id === tokenId);
  if (token) { token.tapped = Math.max(0, token.tapped - 1); saveState(); renderTokenList(); }
  document.getElementById('sacrificeModal').setAttribute('hidden', '');
  sacrificeCtx = null;
});

// Prevent scroll bounce on body (iOS)
document.body.addEventListener('touchmove', e => {
  if (!e.target.closest('.token-list, .search-results')) {
    e.preventDefault();
  }
}, { passive: false });

/* ─── INIT ───────────────────────────────────────────────────────── */
renderPlayerTabs();
renderTokenList();
