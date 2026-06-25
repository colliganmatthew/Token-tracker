/* ── STATE ──────────────────────────────────────────────────── */
let tokens = loadState();
// token: { id, name, imageUrl, untapped, tapped }

let mfactCount = loadMfact();

// Context for the set-value modal
let setValueCtx = null; // { id, field, tokenName }

/* ── MANUFACTOR NAMES (case-insensitive match) ───────────────── */
const MFACT_NAMES = ['clue', 'food', 'treasure'];

function isMfactToken(name) {
  const lower = name.toLowerCase();
  return MFACT_NAMES.some(n => lower.includes(n));
}

/* Multiplier: 0 copies = 1 (normal), N copies = 3^(N-1) each of all three */
function mfactMultiplier() {
  if (mfactCount === 0) return null; // no effect
  return Math.pow(3, mfactCount - 1);
}

/* ── PERSISTENCE ─────────────────────────────────────────────── */
function loadState() {
  try {
    const s = localStorage.getItem('mtg-tt-v2');
    if (s) return JSON.parse(s);
  } catch(e) {}
  return [];
}
function loadMfact() {
  try { return parseInt(localStorage.getItem('mtg-tt-mfact') || '0', 10); } catch(e) { return 0; }
}
function save() {
  try { localStorage.setItem('mtg-tt-v2', JSON.stringify(tokens)); } catch(e) {}
}
function saveMfact() {
  try { localStorage.setItem('mtg-tt-mfact', String(mfactCount)); } catch(e) {}
}

/* ── SCRYFALL ────────────────────────────────────────────────── */
let searchTimer = null;

async function searchTokens(q) {
  if (!q || q.length < 2) { hint('Start typing to search Scryfall.'); return; }
  loading();
  try {
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q + ' t:token')}&order=name&unique=cards&include_extras=true`;
    const r = await fetch(url);
    if (r.status === 404) { hint('No tokens found — try a different name.'); return; }
    if (!r.ok) throw new Error();
    const data = await r.json();
    renderResults(data.data || []);
  } catch(e) { hint('Search failed. Check your connection.'); }
}

function getImg(card) {
  if (card.image_uris) return card.image_uris.art_crop || card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris) return card.card_faces[0].image_uris.art_crop || card.card_faces[0].image_uris.normal;
  return null;
}

function hint(msg)    { document.getElementById('searchResults').innerHTML = `<p class="search-hint">${msg}</p>`; }
function loading()    { document.getElementById('searchResults').innerHTML = `<p class="search-loading">Searching…</p>`; }

function renderResults(cards) {
  const el = document.getElementById('searchResults');
  if (!cards.length) { hint('No tokens found — try a different name.'); return; }
  el.innerHTML = '';
  cards.forEach(card => {
    const img = getImg(card);
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      ${img
        ? `<img class="search-thumb" src="${img}" loading="lazy" alt="${card.name}" onerror="this.className='search-thumb-ph';this.textContent='🃏'" />`
        : `<div class="search-thumb-ph">🃏</div>`}
      <div class="search-info">
        <div class="search-name">${card.name}</div>
        <div class="search-type">${card.type_line || ''}</div>
        ${card.power != null ? `<div class="search-pt">${card.power}/${card.toughness}</div>` : ''}
      </div>
    `;
    item.addEventListener('click', () => addToken(card));
    el.appendChild(item);
  });
}

/* ── TOKEN MANAGEMENT ───────────────────────────────────────── */
function addToken(card) {
  const existing = tokens.find(t => t.name === card.name);
  if (existing) {
    existing.untapped++;
  } else {
    tokens.push({ id: Date.now() + Math.random(), name: card.name, imageUrl: getImg(card), untapped: 1, tapped: 0 });
  }
  save();
  render();
  closeSearch();
}

function removeToken(id) {
  tokens = tokens.filter(t => t.id !== id);
  save();
  render();
}

function adj(id, field, delta) {
  const t = tokens.find(t => t.id === id);
  if (!t) return;

  const mult = mfactMultiplier();

  // Manufactor only fires on increments of Clue/Food/Treasure
  if (delta > 0 && mult !== null && isMfactToken(t.name)) {
    // Apply to ALL three mfact token types equally
    const affected = tokens.filter(tk => isMfactToken(tk.name));
    const amount = mult; // 3^(N-1) of each
    affected.forEach(tk => {
      tk[field] = Math.max(0, tk[field] + amount);
    });
    save();
    affected.forEach(tk => renderCounts(tk.id));
    showMfactToast(amount, field);
    return;
  }

  // Normal adjustment (decrements, non-mfact tokens, or 0 manufactors)
  t[field] = Math.max(0, t[field] + delta);
  save();
  renderCounts(id);
}

function tapOne(id) {
  const t = tokens.find(t => t.id === id);
  if (!t || t.untapped === 0) return;
  t.untapped--;
  t.tapped++;
  save();
  renderCounts(id);
}

function untapAll() {
  tokens.forEach(t => { t.untapped += t.tapped; t.tapped = 0; });
  save();
  tokens.forEach(t => renderCounts(t.id));
}

/* ── RENDER ─────────────────────────────────────────────────── */
function render() {
  const grid = document.getElementById('tokenGrid');

  if (!tokens.length) {
    grid.style.gridTemplateRows = '';
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🃏</div>
        <h3>No tokens yet</h3>
        <p>Tap <strong>+ Add Token</strong> below<br>to search for a token type to track.</p>
      </div>`;
    return;
  }

  // Each token row gets equal height
  grid.style.gridTemplateRows = `repeat(${tokens.length}, 1fr)`;

  // Font sizes scale with how many tokens there are
  const n = tokens.length;
  const countSize = n <= 1 ? 96 : n <= 2 ? 72 : n <= 3 ? 56 : n <= 4 ? 44 : n <= 5 ? 36 : 28;
  const labelSize = n <= 1 ? 16 : n <= 2 ? 13 : n <= 3 ? 11 : 10;
  const nameSize  = n <= 1 ? 122 : n <= 2 ? 108 : n <= 3 ? 96 : n <= 4 ? 86 : n <= 5 ? 80 : 74;

  grid.innerHTML = '';

  tokens.forEach(tok => {
    const bg = tok.imageUrl ? `background-image:url('${tok.imageUrl}')` : '';
    const row = document.createElement('div');
    row.className = 'token-row';
    row.dataset.id = tok.id;

    row.innerHTML = `
      <!-- UNTAPPED HALF -->
      <div class="half untap-half" data-half="untap" data-id="${tok.id}">
        <div class="half-bg" style="${bg}"></div>
        <div class="half-inc" data-action="inc-untap" data-id="${tok.id}"></div>
        <div class="half-dec" data-action="dec-untap" data-id="${tok.id}"></div>
        <div class="half-name" style="font-size:${nameSize}px">${tok.name}</div>
        <div class="half-content">
          <span class="half-label" style="font-size:${labelSize}px">Untapped</span>
          <span class="half-count" style="font-size:${countSize}px" data-count="untapped" data-id="${tok.id}">${tok.untapped}</span>
        </div>
        <button class="btn-remove" data-action="remove" data-id="${tok.id}" title="Remove token">✕</button>
        <button class="btn-set-val" data-action="set-untap" data-id="${tok.id}" title="Set untapped count">=</button>
      </div>

      <!-- TAP BUTTON -->
      <div class="tap-col">
        <button class="btn-tap" data-action="tap" data-id="${tok.id}" title="Tap one">↷</button>
      </div>

      <!-- TAPPED HALF -->
      <div class="half tap-half" data-half="tap" data-id="${tok.id}">
        <div class="half-bg" style="${bg}"></div>
        <div class="half-inc" data-action="inc-tapped" data-id="${tok.id}"></div>
        <div class="half-dec" data-action="dec-tapped" data-id="${tok.id}"></div>
        <div class="half-name" style="font-size:${nameSize}px">${tok.name}</div>
        <div class="half-content">
          <span class="half-label" style="font-size:${labelSize}px">Tapped</span>
          <span class="half-count" style="font-size:${countSize}px" data-count="tapped" data-id="${tok.id}">${tok.tapped}</span>
        </div>
        <button class="btn-set-val btn-set-val-right" data-action="set-tapped" data-id="${tok.id}" title="Set tapped count">=</button>
      </div>
    `;

    grid.appendChild(row);
  });

  // Event delegation on the grid
  grid.addEventListener('click', handleGridClick, { once: false });
}

// Only update the count spans — no full re-render, avoids flicker
function renderCounts(id) {
  const t = tokens.find(t => t.id === id);
  if (!t) return;
  const el = document.getElementById('tokenGrid');
  const untapEl = el.querySelector(`[data-count="untapped"][data-id="${id}"]`);
  const tapEl   = el.querySelector(`[data-count="tapped"][data-id="${id}"]`);
  if (untapEl) untapEl.textContent = t.untapped;
  if (tapEl)   tapEl.textContent   = t.tapped;
}

let _delegated = false;
function handleGridClick(e) {
  // Walk up to find a data-action element
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = parseFloat(el.dataset.id);
  e.stopPropagation();

  switch (action) {
    case 'inc-untap':  adj(id, 'untapped', +1); break;
    case 'dec-untap':  adj(id, 'untapped', -1); break;
    case 'inc-tapped': adj(id, 'tapped',   +1); break;
    case 'dec-tapped': adj(id, 'tapped',   -1); break;
    case 'tap':        tapOne(id);               break;
    case 'remove':     removeToken(id);          break;
    case 'set-untap':  openSetValue(id, 'untapped'); break;
    case 'set-tapped': openSetValue(id, 'tapped');   break;
  }
}

// Attach once at the grid level
document.getElementById('tokenGrid').addEventListener('click', handleGridClick);

/* ── MANUFACTOR UI ──────────────────────────────────────────── */
function renderMfact() {
  document.getElementById('mfactCount').textContent = mfactCount;
  const mult = mfactMultiplier();
  const display = document.querySelector('.mfact-display');
  if (mfactCount === 0) {
    display.classList.remove('mfact-active');
    display.title = 'No Manufactors — no effect';
  } else {
    display.classList.add('mfact-active');
    display.title = `${mfactCount} Manufactor${mfactCount > 1 ? 's' : ''} — creates ×${mult} of each`;
  }
}

function showMfactToast(amount, field) {
  const existing = document.getElementById('mfactToast');
  if (existing) existing.remove();
  const zone = field === 'untapped' ? 'untapped' : 'tapped';
  const toast = document.createElement('div');
  toast.id = 'mfactToast';
  toast.className = 'mfact-toast';
  toast.innerHTML = `⚙ Manufactor: +${amount} Clue, Food & Treasure <span class="toast-zone">(${zone})</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

document.getElementById('mfactInc').addEventListener('click', () => {
  mfactCount = Math.min(10, mfactCount + 1);
  saveMfact();
  renderMfact();
});
document.getElementById('mfactDec').addEventListener('click', () => {
  mfactCount = Math.max(0, mfactCount - 1);
  saveMfact();
  renderMfact();
});

/* ── SET VALUE MODAL ────────────────────────────────────────── */
function openSetValue(id, field) {
  const t = tokens.find(t => t.id === id);
  if (!t) return;
  setValueCtx = { id, field };
  const zone = field === 'untapped' ? 'Untapped' : 'Tapped';
  document.getElementById('setValueTitle').textContent = `Set ${t.name} — ${zone}`;
  document.getElementById('setValueHint').textContent =
    `Current: ${t[field]}. Enter the new count.`;
  const input = document.getElementById('setValueInput');
  input.value = t[field];
  document.getElementById('setValueModal').removeAttribute('hidden');
  setTimeout(() => { input.focus(); input.select(); }, 60);
}

function closeSetValue() {
  document.getElementById('setValueModal').setAttribute('hidden', '');
  setValueCtx = null;
}

function confirmSetValue() {
  if (!setValueCtx) return;
  const raw = parseInt(document.getElementById('setValueInput').value, 10);
  if (isNaN(raw) || raw < 0) return;
  const { id, field } = setValueCtx;
  const t = tokens.find(t => t.id === id);
  if (!t) return;
  t[field] = raw;
  save();
  renderCounts(id);
  closeSetValue();
}

document.getElementById('closeSetValue').addEventListener('click', closeSetValue);
document.getElementById('cancelSetValue').addEventListener('click', closeSetValue);
document.getElementById('setValueModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSetValue();
});
document.getElementById('confirmSetValue').addEventListener('click', confirmSetValue);

// +/− nudge buttons inside the set-value modal
document.getElementById('svInc').addEventListener('click', () => {
  const inp = document.getElementById('setValueInput');
  inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + 1);
});
document.getElementById('svDec').addEventListener('click', () => {
  const inp = document.getElementById('setValueInput');
  inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) - 1);
});

// Confirm on Enter key
document.getElementById('setValueInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmSetValue();
});

/* ── RESET ALL MODAL ─────────────────────────────────────────── */
function openReset() {
  document.getElementById('resetModal').removeAttribute('hidden');
}
function closeReset() {
  document.getElementById('resetModal').setAttribute('hidden', '');
}
function confirmReset() {
  tokens.forEach(t => { t.untapped = 0; t.tapped = 0; });
  save();
  tokens.forEach(t => renderCounts(t.id));
  closeReset();
}

document.getElementById('resetAll').addEventListener('click', openReset);
document.getElementById('closeReset').addEventListener('click', closeReset);
document.getElementById('cancelReset').addEventListener('click', closeReset);
document.getElementById('resetModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeReset();
});
document.getElementById('confirmReset').addEventListener('click', confirmReset);

/* ── SEARCH MODAL ───────────────────────────────────────────── */
function openSearch() {
  document.getElementById('searchModal').removeAttribute('hidden');
  setTimeout(() => document.getElementById('searchInput').focus(), 60);
}
function closeSearch() {
  document.getElementById('searchModal').setAttribute('hidden', '');
  document.getElementById('searchInput').value = '';
  hint('Start typing to search Scryfall.');
}

document.getElementById('openSearch').addEventListener('click', openSearch);
document.getElementById('closeSearch').addEventListener('click', closeSearch);
document.getElementById('searchModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSearch();
});

document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { hint('Start typing to search Scryfall.'); return; }
  searchTimer = setTimeout(() => searchTokens(q), 340);
});

document.getElementById('untapAll').addEventListener('click', untapAll);

/* ── PREVENT BODY SCROLL (iOS) ──────────────────────────────── */
document.body.addEventListener('touchmove', e => {
  if (!e.target.closest('.search-results, .search-input')) e.preventDefault();
}, { passive: false });

/* ── INIT ───────────────────────────────────────────────────── */
render();
renderMfact();