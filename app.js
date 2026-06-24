/* ── STATE ──────────────────────────────────────────────────── */
let tokens = loadState();
// token: { id, name, imageUrl, untapped, tapped }

/* ── PERSISTENCE ─────────────────────────────────────────────── */
function loadState() {
  try {
    const s = localStorage.getItem('mtg-tt-v2');
    if (s) return JSON.parse(s);
  } catch(e) {}
  return [];
}
function save() {
  try { localStorage.setItem('mtg-tt-v2', JSON.stringify(tokens)); } catch(e) {}
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
  const nameSize  = n <= 1 ? 14 : n <= 2 ? 12 : n <= 3 ? 11 : 10;

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
        <div class="half-content">
          <span class="half-label" style="font-size:${labelSize}px">Untapped</span>
          <span class="half-count" style="font-size:${countSize}px" data-count="untapped" data-id="${tok.id}">${tok.untapped}</span>
        </div>
        <button class="btn-remove" data-action="remove" data-id="${tok.id}" title="Remove token">✕</button>
        <div class="half-name" style="font-size:${nameSize}px">${tok.name}</div>
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
        <div class="half-content">
          <span class="half-label" style="font-size:${labelSize}px">Tapped</span>
          <span class="half-count" style="font-size:${countSize}px" data-count="tapped" data-id="${tok.id}">${tok.tapped}</span>
        </div>
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
  }
}

// Attach once at the grid level
document.getElementById('tokenGrid').addEventListener('click', handleGridClick);

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
