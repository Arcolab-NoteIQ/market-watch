/* Pivot Path Market & Competitor Watch: static app, data in /data, team notes via /api/notes */
(() => {
  'use strict';

  const SCOPES = {
    products: ['NoteIQ', 'AnomIQ', 'InvestigationIQ', 'GoLanzar', 'Pivot-MES', 'NovaVigil'],
    services: ['Pharmacovigilance', 'CSV', 'Data Management', 'Clinical Operations', 'Digital Transformation'],
    ai: ['Pharma AI'],
    reg: ['Regulatory']
  };
  const TABS = ['ai', 'products', 'services', 'fda483', 'flagged'];
  const API = '/api/notes';

  const state = {
    news: [], fda: [], comp: [], sites: [], run: {},
    notes: [], notesOn: false,
    f: { ai: {}, products: {}, services: {}, fda: {} },
    open: new Set()
  };

  /* ---------- helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const link = (u, text, cls) => (safeUrl(u) ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', class: cls }, text) : h('span', { class: cls }, text));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(s) {
    if (!s) return 'n/d';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : s;
  }
  function fmtWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function hash(s) {
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
    return (x >>> 0).toString(36);
  }
  const keyNews = (r) => 'n-' + hash([r.url, r.company, r.date].join('|'));
  const keyFda = (r) => 'f-' + hash(r.url || [r.company, r.event_date].join('|'));
  const keyComp = (r) => 'c-' + hash([r.area, r.competitor].join('|'));
  const country = (l) => (/, US$/.test(l || '') ? 'United States' : String(l || '').split(', ').pop());
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
  };

  /* ---------- data ---------- */
  async function getJSON(path) {
    const r = await fetch(path + '?v=' + Math.floor(Date.now() / 3.6e6), { cache: 'no-store' });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  }
  async function loadData() {
    const [news, fda, comp, run, sites] = await Promise.all([
      getJSON('data/news.json'), getJSON('data/fda.json'), getJSON('data/competitors.json'),
      getJSON('data/run.json').catch(() => [{}]), getJSON('data/sites.json').catch(() => [])
    ]);
    state.news = news; state.fda = fda; state.comp = comp; state.run = run[0] || {}; state.sites = sites;
  }

  /* ---------- team notes ---------- */
  async function loadNotes() {
    try {
      const r = await fetch(API, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      state.notes = Array.isArray(j.notes) ? j.notes : [];
      state.notesOn = true;
    } catch {
      state.notes = []; state.notesOn = false;
    }
  }
  const notesFor = (key) => state.notes.filter((n) => n.item === key);
  const myTokens = () => ls.get('pp-note-tokens', {});
  function myName(ask) {
    let n = ls.get('pp-name', '');
    if (!n && ask) {
      n = (window.prompt('Your name (shown next to your flags and comments):') || '').trim().slice(0, 40);
      if (n) ls.set('pp-name', n);
    }
    return n;
  }
  async function postNote(item, kind, text) {
    const name = myName(true);
    if (!name) return false;
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item, kind, name, text: text || '' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || String(r.status));
      const t = myTokens(); t[j.note.id] = j.token; ls.set('pp-note-tokens', t);
      state.notes.push(j.note);
      return true;
    } catch (e) { toast('Could not save: ' + e.message); return false; }
  }
  async function deleteNote(id) {
    const token = myTokens()[id];
    if (!token) return;
    try {
      const r = await fetch(API, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, token }) });
      if (!r.ok) throw new Error(String(r.status));
      state.notes = state.notes.filter((n) => n.id !== id);
      const t = myTokens(); delete t[id]; ls.set('pp-note-tokens', t);
    } catch (e) { toast('Could not remove: ' + e.message); }
  }

  function teamBar(key) {
    if (!state.notesOn) return null;
    const ns = notesFor(key);
    const flags = ns.filter((n) => n.kind === 'flag');
    const comments = ns.filter((n) => n.kind === 'comment');
    const me = ls.get('pp-name', '');
    const mine = flags.find((n) => myTokens()[n.id]);
    const flagBtn = h('button', { type: 'button', class: 'act' + (mine ? ' on' : ''), 'aria-pressed': mine ? 'true' : 'false',
      onclick: async () => { if (mine) await deleteNote(mine.id); else await postNote(key, 'flag', ''); renderAll(); } },
      mine ? 'Flagged' : 'Flag');
    const who = flags.length ? h('span', { class: 'who' }, 'Flagged by ' + flags.map((n) => n.name).join(', ')) : null;
    const open = state.open.has(key);
    const cBtn = h('button', { type: 'button', class: 'act', 'aria-expanded': open ? 'true' : 'false',
      onclick: () => { if (open) state.open.delete(key); else state.open.add(key); renderAll(); } },
      `Comments (${comments.length})`);
    const bar = h('div', { class: 'actions' }, flagBtn, cBtn, who);
    const frag = document.createDocumentFragment();
    frag.append(bar);
    if (open) frag.append(thread(key, comments, me));
    return frag;
  }
  function thread(key, comments, me) {
    const list = comments.sort((a, b) => a.at.localeCompare(b.at)).map((n) =>
      h('p', { class: 'note-row' }, h('span', { class: 'by' }, n.name), h('span', { class: 'when' }, fmtWhen(n.at)), h('br'), n.text,
        myTokens()[n.id] ? h('button', { type: 'button', class: 'act del', onclick: async () => { await deleteNote(n.id); renderAll(); } }, 'Delete') : null));
    const nameIn = h('input', { type: 'text', maxlength: '40', placeholder: 'Your name', value: me || '', 'aria-label': 'Your name' });
    const textIn = h('textarea', { maxlength: '500', rows: '1', placeholder: 'Add a comment, e.g. relevant for the eBrain pitch', 'aria-label': 'Comment' });
    const send = h('button', { type: 'submit', class: 'btn-fill' }, 'Post');
    const form = h('form', { class: 'note-form', onsubmit: async (e) => {
      e.preventDefault();
      const nm = nameIn.value.trim().slice(0, 40); const tx = textIn.value.trim();
      if (!nm || !tx) { toast('Add your name and a comment.'); return; }
      ls.set('pp-name', nm); send.disabled = true;
      if (await postNote(key, 'comment', tx)) renderAll(); else send.disabled = false;
    } }, nameIn, textIn, send);
    return h('div', { class: 'thread' }, list.length ? list : h('p', { class: 'muted note-row' }, 'No comments yet.'), form);
  }

  /* ---------- filters ---------- */
  function select(label, opts, value, onchange) {
    const s = h('select', { 'aria-label': label, onchange: (e) => onchange(e.target.value) },
      opts.map(([v, t]) => h('option', { value: v, selected: v === value ? true : null }, t)));
    return h('label', null, label, s);
  }
  function renderFilters() {
    document.querySelectorAll('.filters').forEach((box) => {
      const sc = box.dataset.scope; const f = state.f[sc];
      const kids = [];
      if (sc === 'fda') {
        kids.push(select('Document', [['', 'All documents'], ['Form 483', 'Form 483'], ['Warning letter', 'Warning letter']], f.doc || '', (v) => { f.doc = v; renderFda(); }));
        const cs = [...new Set(state.fda.map((r) => country(r.location)))].sort();
        kids.push(select('Location', [['', 'All locations'], ...cs.map((c) => [c, c])], f.loc || '', (v) => { f.loc = v; renderFda(); }));
        kids.push(select('Synopsis', [['', 'All rows'], ['yes', 'With synopsis only']], f.syn || '', (v) => { f.syn = v; renderFda(); }));
        const q = h('input', { type: 'search', placeholder: 'Company or FEI', value: f.q || '', 'aria-label': 'Search', oninput: (e) => { f.q = e.target.value; renderFda(); } });
        kids.push(h('label', null, 'Search', q));
      } else {
        const areas = SCOPES[sc];
        if (sc !== 'ai') kids.push(select(sc === 'products' ? 'Product' : 'Service', [['', sc === 'products' ? 'All products' : 'All services'], ...areas.map((a) => [a, a])], f.area || '', (v) => { f.area = v; renderScope(sc); }));
        const types = [...new Set(state.news.filter((r) => areas.includes(r.area)).map((r) => r.type))].sort();
        kids.push(select('Type', [['', 'All types'], ...types.map((t) => [t, t])], f.type || '', (v) => { f.type = v; renderScope(sc); }));
        kids.push(select('Signal', [['', 'Any signal'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']], f.sig || '', (v) => { f.sig = v; renderScope(sc); }));
        kids.push(h('button', { type: 'button', class: 'btn-link', onclick: () => downloadNewsCsv(sc) }, 'Download CSV'));
      }
      box.replaceChildren(...kids);
    });
  }

  /* ---------- news ---------- */
  function newsItem(r) {
    const key = keyNews(r);
    const flagged = notesFor(key).some((n) => n.kind === 'flag');
    return h('article', { class: 'item' + (flagged ? ' is-flagged' : ''), id: key },
      h('div', { class: 'item-meta' }, h('span', { class: 'nowrap' }, fmtDate(r.date)), h('span', { class: 'pill' }, r.area), h('span', null, r.type), h('span', { class: 'pill sig-' + r.signal }, r.signal)),
      h('h4', null, link(r.url, r.headline)),
      h('p', { class: 'why' }, h('b', null, 'Why it matters: '), r.why_it_matters),
      h('div', { class: 'src' }, r.company, ' · ', r.source),
      teamBar(key));
  }
  function filteredNews(sc) {
    const f = state.f[sc] || {}; const areas = SCOPES[sc];
    return state.news.filter((r) => areas.includes(r.area) && (!f.area || r.area === f.area) && (!f.type || r.type === f.type) && (!f.sig || r.signal === f.sig))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  function renderFeed(sc) {
    document.querySelectorAll(`[data-feed="${sc}"]`).forEach((el) => {
      const rows = filteredNews(sc);
      el.replaceChildren(...(rows.length ? rows.map(newsItem) : [h('p', { class: 'empty' }, 'No items match these filters this cycle.')]));
    });
  }
  function renderBars(sc) {
    document.querySelectorAll(`[data-bars="${sc}"]`).forEach((el) => {
      const counts = SCOPES[sc].map((a) => [a, state.news.filter((r) => r.area === a).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...counts.map(([, n]) => n));
      el.replaceChildren(...counts.map(([a, n]) => h('div', { class: 'bar-row', title: `${a}: ${n} item${n === 1 ? '' : 's'}` },
        h('span', null, a), h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${(n / max) * 100}%` })), h('span', { class: 'bar-n' }, n))));
      if (!counts.length) el.replaceChildren(h('p', { class: 'muted' }, 'No items yet.'));
    });
  }

  /* ---------- competitors ---------- */
  function compRows(sc) {
    const f = state.f[sc] || {}; const areas = SCOPES[sc];
    return state.comp.map((r, i) => ({ r, i })).filter(({ r }) => areas.includes(r.area) && (!f.area || r.area === f.area))
      .sort((a, b) => areas.indexOf(a.r.area) - areas.indexOf(b.r.area) || (a.r.group || '').localeCompare(b.r.group || '') || a.i - b.i).map((x) => x.r);
  }
  function renderComp(sc) {
    const t = document.querySelector(`[data-comp="${sc}"]`);
    if (!t) return;
    const head = h('thead', null, h('tr', null, ['Our ' + (sc === 'products' ? 'product' : 'service'), 'Competitor', 'Offering', 'Latest move', 'Date', 'Overlap'].map((c) => h('th', null, c))));
    const body = h('tbody');
    let last = '';
    const rows = compRows(sc);
    rows.forEach((r) => {
      const gk = r.group ? r.area + '|' + r.group : '';
      if (gk && gk !== last) body.append(h('tr', { class: 'group' }, h('td', { colspan: '6' }, r.area + ': ' + r.group)));
      last = gk;
      const key = keyComp(r);
      body.append(h('tr', { id: key },
        h('td', null, r.area), h('td', { class: r.group ? 'indent' : null }, r.competitor), h('td', null, r.offering),
        h('td', null, link(r.url, r.latest_move), teamBar(key)), h('td', { class: 'nowrap' }, fmtDate(r.move_date)), h('td', null, r.overlap)));
    });
    if (!rows.length) body.append(h('tr', null, h('td', { colspan: '6', class: 'muted' }, 'No competitors tracked for this selection yet.')));
    t.replaceChildren(head, body);
  }

  /* ---------- FDA ---------- */
  function fdaRows() {
    const f = state.f.fda; const q = (f.q || '').toLowerCase();
    return state.fda.filter((r) => (!f.doc || r.doc_type === f.doc) && (!f.loc || country(r.location) === f.loc) && (!f.syn || r.synopsis) &&
      (!q || r.company.toLowerCase().includes(q) || String(r.fei || '').includes(q)))
      .sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')));
  }
  function renderFda() {
    const t = document.getElementById('fda-table');
    const rows = fdaRows();
    document.getElementById('fda-count').textContent = `${rows.length} of ${state.fda.length} records`;
    const head = h('thead', null, h('tr', null, ['Document', 'Company', 'Location', 'Inspection end or letter date', 'FEI', 'Source', 'Synopsis'].map((c) => h('th', null, c))));
    const body = h('tbody', null, rows.map((r) => {
      const key = keyFda(r);
      const syn = r.synopsis
        ? [r.synopsis, ' ', safeUrl(r.synopsis_url) && r.synopsis_url !== r.url ? link(r.synopsis_url, 'Source') : null]
        : [h('span', { class: 'muted' }, 'Not publicly disclosed')];
      return h('tr', { id: key },
        h('td', { class: 'nowrap' }, r.doc_type), h('td', null, link(r.url, r.company)), h('td', null, r.location),
        h('td', { class: 'nowrap' }, fmtDate(r.event_date)), h('td', { class: 'nowrap' }, r.fei || ''), h('td', null, r.source || ''),
        h('td', { class: 'syn' }, syn, teamBar(key)));
    }));
    if (!rows.length) body.append(h('tr', null, h('td', { colspan: '7', class: 'muted' }, 'Nothing matches these filters.')));
    t.replaceChildren(head, body);
  }

  /* ---------- flagged ---------- */
  function renderFlagged() {
    const byItem = new Map();
    state.notes.forEach((n) => { const p = byItem.get(n.item); if (!p || n.at > p) byItem.set(n.item, n.at); });
    const flagsN = state.notes.filter((n) => n.kind === 'flag').length;
    document.getElementById('flag-count').textContent = state.notesOn && byItem.size ? String(byItem.size) : '';
    document.getElementById('k-flags').textContent = state.notesOn ? String(flagsN) : 'Off';
    const el = document.getElementById('flagged-feed');
    if (!state.notesOn) { el.replaceChildren(h('p', { class: 'empty' }, 'Team flags and comments are not available in this copy of the app (the notes service is not running).')); return; }
    const out = [];
    [...byItem.entries()].sort((a, b) => b[1].localeCompare(a[1])).forEach(([key]) => {
      const n = state.news.find((r) => keyNews(r) === key);
      if (n) { out.push(newsItem(n)); return; }
      const f = state.fda.find((r) => keyFda(r) === key);
      if (f) { out.push(h('article', { class: 'item is-flagged' }, h('div', { class: 'item-meta' }, h('span', { class: 'pill' }, f.doc_type), fmtDate(f.event_date), f.location), h('h4', null, link(f.url, f.company)), f.synopsis ? h('p', { class: 'why' }, f.synopsis) : null, teamBar(key))); return; }
      const c = state.comp.find((r) => keyComp(r) === key);
      if (c) { out.push(h('article', { class: 'item is-flagged' }, h('div', { class: 'item-meta' }, h('span', { class: 'pill' }, c.area), 'Competitor watchlist'), h('h4', null, c.competitor), h('p', { class: 'why' }, link(c.url, c.latest_move), ' (', fmtDate(c.move_date), ')'), teamBar(key))); }
    });
    el.replaceChildren(...(out.length ? out : [h('p', { class: 'empty' }, 'Nothing flagged yet. Use Flag or Comments on any item to share it with the team.')]));
  }

  /* ---------- sites ---------- */
  function renderSites() {
    const t = document.getElementById('sites-table');
    const head = h('thead', null, h('tr', null, ['Website', 'Product or service', 'What to watch', 'Last checked', 'Latest finding'].map((c) => h('th', null, c))));
    const body = h('tbody', null, state.sites.map((r) => h('tr', null, h('td', null, link(r.url, r.label || r.url)), h('td', null, r.area || 'General'), h('td', null, r.notes || ''), h('td', { class: 'nowrap' }, r.last_checked ? fmtDate(r.last_checked) : 'Not yet'), h('td', null, r.last_finding || ''))));
    if (!state.sites.length) body.append(h('tr', null, h('td', { colspan: '5', class: 'muted' }, 'No websites tracked yet.')));
    t.replaceChildren(head, body);
    const box = document.getElementById('site-suggestions');
    if (!state.notesOn) { box.replaceChildren(); return; }
    const key = 'site-suggestions';
    const cs = notesFor(key).filter((n) => n.kind === 'comment');
    box.replaceChildren(h('h3', null, 'Suggest a website to track'), h('p', { class: 'sub' }, 'Paste the address and say what to watch for, e.g. "https://example.com/news, new product launches".'), thread(key, cs, ls.get('pp-name', '')));
  }

  /* ---------- header ---------- */
  function renderHeader() {
    const high = state.news.filter((r) => r.signal === 'High').length;
    const f483 = state.fda.filter((r) => r.doc_type === 'Form 483');
    const latest = f483.map((r) => r.event_date || '').sort().pop();
    const counts = {};
    state.news.forEach((r) => { counts[r.area] = (counts[r.area] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('lede').textContent = `${high} high-signal items this cycle across our products and services. The busiest area is ${top ? top[0] : 'n/a'}, and the newest Form 483 listed is from an inspection that closed on ${fmtDate(latest)}.`;
    document.getElementById('meta').textContent = `Last refreshed ${fmtDate(state.run.refreshed)}. Next automatic refresh ${fmtDate(state.run.next_refresh)}.`;
    document.getElementById('k-items').textContent = state.news.length;
    document.getElementById('k-high').textContent = high;
    document.getElementById('k-483').textContent = f483.length;
  }

  /* ---------- CSV ---------- */
  function csv(rows, cols) {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.map((c) => esc(c[0])).join(','), ...rows.map((r) => cols.map((c) => esc(r[c[1]])).join(','))].join('\n');
  }
  function download(name, text) {
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  function downloadNewsCsv(sc) {
    download(`pivotpath-${sc}-news-${stamp()}.csv`, csv(filteredNews(sc), [['Date', 'date'], ['Area', 'area'], ['Type', 'type'], ['Signal', 'signal'], ['Company', 'company'], ['Headline', 'headline'], ['Why it matters', 'why_it_matters'], ['Source', 'source'], ['URL', 'url']]));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-csv]');
    if (!b) return;
    const k = b.dataset.csv;
    if (k === 'fda') download(`pivotpath-483s-${stamp()}.csv`, csv(fdaRows(), [['Document', 'doc_type'], ['Company', 'company'], ['Location', 'location'], ['Inspection end or letter date', 'event_date'], ['FEI', 'fei'], ['Source', 'source'], ['Synopsis', 'synopsis'], ['Synopsis source', 'synopsis_url'], ['Document URL', 'url']]));
    else { const sc = k.split('-')[1]; download(`pivotpath-competitors-${sc}-${stamp()}.csv`, csv(compRows(sc), [['Area', 'area'], ['Group', 'group'], ['Competitor', 'competitor'], ['Offering', 'offering'], ['Latest move', 'latest_move'], ['Date', 'move_date'], ['Overlap', 'overlap'], ['URL', 'url']])); }
  });

  /* ---------- tabs ---------- */
  let current = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'ai';
  function showTab(id, push) {
    current = id;
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== id; });
    document.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    if (push) history.replaceState(null, '', '#' + id);
  }
  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => showTab(b.dataset.tab, true));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const i = TABS.indexOf(b.dataset.tab);
      const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      showTab(n, true);
      document.querySelector(`.tab[data-tab="${n}"]`).focus();
    });
  });
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (TABS.includes(id)) showTab(id, false); });
  document.getElementById('print-btn').addEventListener('click', () => window.print());

  /* ---------- render ---------- */
  function renderScope(sc) { renderFeed(sc); if (sc === 'products' || sc === 'services') renderComp(sc); }
  function renderAll() {
    renderHeader(); renderFilters();
    ['ai', 'products', 'services', 'reg'].forEach(renderFeed);
    ['products', 'services'].forEach((sc) => { renderBars(sc); renderComp(sc); });
    renderFda(); renderSites(); renderFlagged();
  }

  (async () => {
    showTab(current, false);
    try {
      await Promise.all([loadData(), loadNotes()]);
      renderAll();
    } catch (e) {
      document.getElementById('lede').textContent = 'The data could not be loaded. Please refresh the page; if this persists, tell the marketing team.';
      console.error(e);
    }
    setInterval(async () => { if (document.visibilityState === 'visible' && !document.querySelector('.note-form textarea:focus, .note-form input:focus')) { await loadNotes(); renderAll(); } }, 60000);
  })();
})();
