const TIER_LABELS = {
  MEGA_GRFTY: 'Mega',
  SUPER_GRFTY: 'Super',
  XTRA_GRFTY: 'Xtra',
  VERY_GRFTY: 'Very',
  KINDA_GRFTY: 'Kinda',
};

const TIER_ORDER = ['MEGA_GRFTY', 'SUPER_GRFTY', 'XTRA_GRFTY', 'VERY_GRFTY', 'KINDA_GRFTY'];

const state = { memes: [], query: '', activeTiers: new Set() };

const el = {
  grid: document.getElementById('grid'),
  search: document.getElementById('search'),
  count: document.getElementById('count'),
  empty: document.getElementById('empty'),
  tierFilters: document.getElementById('tierFilters'),
  modal: document.getElementById('modal'),
  modalImg: document.getElementById('modalImg'),
  modalName: document.getElementById('modalName'),
  modalDesc: document.getElementById('modalDesc'),
  modalTier: document.getElementById('modalTier'),
  modalPower: document.getElementById('modalPower'),
};

function tierColorVar(tier) {
  return `var(--tier-${tier.split('_')[0].toLowerCase()})`;
}

function renderTierFilters() {
  el.tierFilters.innerHTML = TIER_ORDER.map(
    (tier) => `<button class="tier-chip" data-tier="${tier}" style="--chip-color:${tierColorVar(tier)}">${TIER_LABELS[tier]}</button>`
  ).join('');

  el.tierFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.tier-chip');
    if (!btn) return;
    const tier = btn.dataset.tier;
    if (state.activeTiers.has(tier)) state.activeTiers.delete(tier);
    else state.activeTiers.add(tier);
    btn.classList.toggle('active');
    render();
  });
}

function filteredMemes() {
  const q = state.query.trim().toLowerCase();
  return state.memes.filter((m) => {
    const matchesTier = state.activeTiers.size === 0 || state.activeTiers.has(m.tier);
    const matchesQuery = !q || m.name.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q);
    return matchesTier && matchesQuery;
  });
}

function cardHtml(m) {
  return `
    <article class="card" data-id="${m.id}">
      <img src="${m.imageUrl}" alt="${m.name}" />
      <div class="card-body">
        <span class="tier-badge" style="--tier-color:${tierColorVar(m.tier)}">${TIER_LABELS[m.tier] || m.tier}</span>
        <div class="card-name">${m.name}</div>
        <div class="card-desc">${m.description || ''}</div>
      </div>
    </article>`;
}

function render() {
  const results = filteredMemes();
  el.grid.innerHTML = results.map(cardHtml).join('');
  el.count.textContent = `${results.length} of ${state.memes.length} memes`;
  el.empty.hidden = results.length !== 0;
}

function openModal(meme) {
  el.modalImg.src = meme.imageUrl;
  el.modalImg.alt = meme.name;
  el.modalName.textContent = meme.name;
  el.modalDesc.textContent = meme.description || '';
  el.modalTier.textContent = TIER_LABELS[meme.tier] || meme.tier;
  el.modalTier.style.setProperty('--tier-color', tierColorVar(meme.tier));
  el.modalPower.textContent = meme.grftPower ? `GRFT power: ${meme.grftPower}` : '';
  el.modal.hidden = false;
}

function closeModal() {
  el.modal.hidden = true;
}

async function init() {
  renderTierFilters();

  el.search.addEventListener('input', (e) => {
    state.query = e.target.value;
    render();
  });

  el.grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const meme = state.memes.find((m) => m.id === card.dataset.id);
    if (meme) openModal(meme);
  });

  el.modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  const res = await fetch('data/memes.json');
  state.memes = await res.json();
  render();
}

init();
