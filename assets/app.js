(() => {
  const slug = document.body.dataset.slug;
  if (!slug) return;

  const state = { manifest: null, sheetIndex: 0, page: 1, rowsPerPage: 100, rows: [], request: 0 };
  const els = {
    sheet: document.querySelector('#sheet-select'),
    search: document.querySelector('#search-input'),
    rows: document.querySelector('#rows-select'),
    head: document.querySelector('#table-head'),
    body: document.querySelector('#table-body'),
    status: document.querySelector('#load-status'),
    summary: document.querySelector('#sheet-summary'),
    filter: document.querySelector('#filter-summary'),
    page: document.querySelector('#page-input'),
    total: document.querySelector('#page-total'),
    prev: document.querySelector('#prev-button'),
    next: document.querySelector('#next-button'),
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function renderValue(value) {
    const text = String(value ?? '');
    if (/^https?:\/\/[^\s]+$/i.test(text)) {
      return `<a href="${escapeHtml(text)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
    }
    return escapeHtml(text);
  }

  async function fetchGzipJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load data (${response.status})`);
    if (!('DecompressionStream' in window)) throw new Error('This browser needs gzip decompression support. Please use a current Chrome, Edge, Firefox, or Safari release.');
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).json();
  }

  function sheet() { return state.manifest.sheets[state.sheetIndex]; }
  function pageCount() { return Math.max(1, Math.ceil(sheet().rows / state.rowsPerPage)); }

  async function loadPage() {
    const currentRequest = ++state.request;
    const active = sheet();
    const firstRow = (state.page - 1) * state.rowsPerPage;
    const lastRow = Math.min(active.rows, firstRow + state.rowsPerPage);
    const firstChunk = Math.floor(firstRow / 500);
    const lastChunk = Math.floor(Math.max(firstRow, lastRow - 1) / 500);
    els.status.textContent = 'Loading rows…';
    els.body.innerHTML = `<tr class="empty-row"><td colspan="${active.headers.length}">Loading data…</td></tr>`;
    try {
      const blocks = await Promise.all(active.chunks.slice(firstChunk, lastChunk + 1).map(file => fetchGzipJson(`data/${slug}/${file}`)));
      if (currentRequest !== state.request) return;
      const joined = blocks.flat();
      const offset = firstRow - firstChunk * 500;
      state.rows = joined.slice(offset, offset + state.rowsPerPage);
      render();
      els.status.textContent = 'Ready';
    } catch (error) {
      if (currentRequest !== state.request) return;
      els.status.textContent = 'Data could not be loaded';
      els.body.innerHTML = `<tr class="empty-row"><td colspan="${active.headers.length}">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  function render() {
    const active = sheet();
    const query = els.search.value.trim().toLocaleLowerCase();
    const filtered = query ? state.rows.filter(row => row.some(cell => String(cell ?? '').toLocaleLowerCase().includes(query))) : state.rows;
    els.head.innerHTML = `<tr>${active.headers.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr>`;
    els.body.innerHTML = filtered.length ? filtered.map(row => `<tr>${active.headers.map((_, i) => `<td><div class="cell-content" title="Click to expand">${renderValue(row[i])}</div></td>`).join('')}</tr>`).join('') : `<tr class="empty-row"><td colspan="${active.headers.length}">No rows match this page filter.</td></tr>`;
    els.summary.textContent = `${active.name} · ${active.rows.toLocaleString()} records`;
    els.filter.textContent = query ? `${filtered.length.toLocaleString()} of ${state.rows.length.toLocaleString()} loaded rows shown` : `Rows ${((state.page - 1) * state.rowsPerPage + 1).toLocaleString()}–${Math.min(active.rows, state.page * state.rowsPerPage).toLocaleString()}`;
    els.page.value = state.page;
    els.page.max = pageCount();
    els.total.textContent = `of ${pageCount().toLocaleString()}`;
    els.prev.disabled = state.page <= 1;
    els.next.disabled = state.page >= pageCount();
  }

  function changePage(value) {
    const next = Math.max(1, Math.min(pageCount(), Number(value) || 1));
    if (next === state.page && state.rows.length) return;
    state.page = next;
    els.search.value = '';
    loadPage();
  }

  fetch(`data/${slug}/manifest.json`)
    .then(response => { if (!response.ok) throw new Error('Workbook manifest not found'); return response.json(); })
    .then(manifest => {
      state.manifest = manifest;
      els.sheet.innerHTML = manifest.sheets.map((s, i) => `<option value="${i}">${escapeHtml(s.name)} (${s.rows.toLocaleString()})</option>`).join('');
      loadPage();
    })
    .catch(error => { els.status.textContent = error.message; });

  els.sheet.addEventListener('change', () => { state.sheetIndex = Number(els.sheet.value); state.page = 1; els.search.value = ''; loadPage(); });
  els.rows.addEventListener('change', () => { state.rowsPerPage = Number(els.rows.value); state.page = 1; els.search.value = ''; loadPage(); });
  els.search.addEventListener('input', render);
  els.prev.addEventListener('click', () => changePage(state.page - 1));
  els.next.addEventListener('click', () => changePage(state.page + 1));
  els.page.addEventListener('change', () => changePage(els.page.value));
  els.body.addEventListener('click', event => { const cell = event.target.closest('.cell-content'); if (cell) cell.classList.toggle('expanded'); });
})();
