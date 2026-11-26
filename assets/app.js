/* Pivot Path Market & Competitor Watch: static app, data in /data, read-only, hosted on GitHub Pages */
(() => {
  'use strict';

  const SCOPES = {
    products: ['NoteIQ', 'AnomIQ', 'InvestigationIQ', 'GoLanzar', 'Pivot-MES', 'NovaVigil'],
    services: ['Pharmacovigilance', 'CSV', 'Data Management', 'Clinical Operations', 'Digital Transformation'],
    ai: ['Pharma AI'],
    reg: ['Regulatory']
  };
  const TABS = ['ai', 'products', 'services', 'fda483'];

  const state = {
    news: [], fda: [], comp: [], sites: [], run: {}, profiles: [], moves: [],
    cw: { area: '', comp: '', q: '' },
    
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

  /* ---------- data ---------- */
  async function getJSON(path) {
    const r = await fetch(path + '?v=' + Math.floor(Date.now() / 3.6e6), { cache: 'no-store' });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  }
  async function loadData() {
    const [news, fda, comp, run, sites, profiles] = await Promise.all([
      getJSON('data/news.json'), getJSON('data/fda.json'), getJSON('data/competitors.json'),
      getJSON('data/run.json').catch(() => [{}]), getJSON('data/sites.json').catch(() => []),
      getJSON('data/profiles.json').catch(() => [])
    ]);
    state.news = news; state.fda = fda; state.comp = comp; state.run = run[0] || {}; state.sites = sites; state.profiles = profiles;
    state.moves = buildMoves(profiles, comp, news);
  }

  /* ---------- filters ---------- */
  function select(label, opts, value, onchange) {
    const s = h('select', { 'aria-label': label, onchange: (e) => onchange(e.target.value) },
      opts.map(([v, t]) => h('option', { value: v, selected: v === value ? true : null }, t)));
    return h('label', null, label, s);
  }
  function renderFilters() {
    document.querySelectorAll('.filters[data-scope]').forEach((box) => {
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
    return h('article', { class: 'item', id: key },
      h('div', { class: 'item-meta' }, h('span', { class: 'nowrap' }, fmtDate(r.date)), h('span', { class: 'pill' }, r.area), h('span', null, r.type), h('span', { class: 'pill sig-' + r.signal }, r.signal)),
      h('h4', null, link(r.url, r.headline)),
      h('p', { class: 'why' }, h('b', null, 'Why it matters: '), r.why_it_matters),
      h('div', { class: 'src' }, r.company, ' · ', r.source));
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
        h('td', null, link(r.url, r.latest_move)), h('td', { class: 'nowrap' }, fmtDate(r.move_date)), h('td', null, r.overlap)));
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
        h('td', { class: 'syn' }, syn));
    }));
    if (!rows.length) body.append(h('tr', null, h('td', { colspan: '7', class: 'muted' }, 'Nothing matches these filters.')));
    t.replaceChildren(head, body);
  }

  /* ---------- competitor watch ---------- */
  const AREAS = [...SCOPES.products, ...SCOPES.services];
  function buildMoves(profiles, competitors, news) {
    const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hits = (co, aliases) => (aliases || []).some((a) => new RegExp('(^|[^A-Za-z])' + esc(a) + '([^A-Za-z]|$)', 'i').test(co));
    const out = []; const seen = new Set();
    news.forEach((n) => profiles.forEach((p) => {
      if (!hits(String(n.company || ''), p.aliases)) return;
      const k = p.id + '|' + (n.url || n.headline); if (seen.has(k)) return; seen.add(k);
      out.push({ profile: p.id, competitor: p.competitor, date: n.date || '', area: n.area, headline: n.headline, url: n.url || '', source: n.source || '', signal: n.signal || '' });
    }));
    const byName = new Map(); profiles.forEach((p) => (p.names || []).forEach((nm) => byName.set(nm, p)));
    competitors.forEach((c) => {
      const p = byName.get(c.competitor);
      if (!p || !c.latest_move || /^No .*found yet$/.test(c.latest_move)) return;
      const k = p.id + '|' + (c.url || c.latest_move); if (seen.has(k)) return; seen.add(k);
      if (c.move_date && out.some((m) => m.profile === p.id && m.date === c.move_date)) return;
      out.push({ profile: p.id, competitor: p.competitor, date: c.move_date || '', area: c.area, headline: c.latest_move, url: c.url || '', source: 'Watchlist', signal: '' });
    });
    return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.competitor.localeCompare(b.competitor));
  }
  const compAreas = (p) => state.comp.filter((r) => (p.names || []).includes(r.competitor)).sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
  function cwMoveOk(m) {
    const f = state.cw;
    return (!f.comp || m.profile === f.comp) && (!f.area || m.area === f.area) && (!f.q || (m.competitor + ' ' + m.headline).toLowerCase().includes(f.q));
  }
  function cwProfiles() {
    const f = state.cw;
    const latest = (id) => (state.moves.find((m) => m.profile === id && m.date) || {}).date || '';
    return state.profiles.filter((p) => (!f.comp || p.id === f.comp) && (!f.area || compAreas(p).some((r) => r.area === f.area)) && (!f.q || (p.competitor + ' ' + (p.about || '') + ' ' + (p.hq || '')).toLowerCase().includes(f.q)))
      .sort((a, b) => latest(b.id).localeCompare(latest(a.id)) || a.competitor.localeCompare(b.competitor));
  }
  function renderCwFilters() {
    const f = state.cw;
    const comps = [...state.profiles].sort((a, b) => a.competitor.localeCompare(b.competitor));
    document.getElementById('cw-filters').replaceChildren(
      select('Our product or service', [['', 'All products and services'], ...AREAS.map((a) => [a, a])], f.area, (v) => { f.area = v; renderCw(); }),
      select('Competitor', [['', 'All competitors'], ...comps.map((p) => [p.id, p.competitor])], f.comp, (v) => { f.comp = v; renderCw(); }),
      h('label', null, 'Search', h('input', { type: 'search', placeholder: 'Name or keyword', 'aria-label': 'Search', value: f.q, oninput: (e) => { f.q = e.target.value.trim().toLowerCase(); renderCw(); } })));
  }
  function moveMeta(m, withName) {
    return h('div', { class: 'item-meta' }, h('span', { class: 'nowrap' }, m.date ? fmtDate(m.date) : 'Date not given'),
      withName ? h('span', { class: 'pill' }, m.competitor) : null, h('span', { class: 'pill' }, m.area),
      m.signal ? h('span', { class: 'pill sig-' + m.signal }, m.signal) : null);
  }
  function renderCw() {
    const ref = new Date((state.run.refreshed || '1970-01-01') + 'T00:00:00Z');
    const within = (d, days) => { if (!d) return false; const t = new Date(d + 'T00:00:00Z'); return t <= ref && (ref - t) / 864e5 <= days; };
    const active = new Set(state.moves.map((m) => m.profile));
    document.getElementById('cw-k-profiles').textContent = state.profiles.length;
    document.getElementById('cw-k-30').textContent = state.moves.filter((m) => within(m.date, 30)).length;
    document.getElementById('cw-k-90').textContent = state.moves.filter((m) => within(m.date, 90)).length;
    document.getElementById('cw-k-quiet').textContent = state.profiles.filter((p) => !active.has(p.id)).length;
    const feed = state.moves.filter((m) => m.date && cwMoveOk(m)).slice(0, 25);
    document.getElementById('cw-feed').replaceChildren(...(feed.length ? feed.map((m) => h('article', { class: 'item' }, moveMeta(m, true), h('h4', null, link(m.url, m.headline)), h('div', { class: 'src' }, m.source))) : [h('p', { class: 'empty' }, 'No dated moves match these filters.')]));
    const cards = cwProfiles();
    document.getElementById('cw-cards').replaceChildren(...(cards.length ? cards.map((p) => {
      const mine = state.moves.filter((m) => m.profile === p.id).slice(0, 4);
      return h('article', { class: 'ccard', id: 'cw-' + p.id },
        h('h3', null, p.competitor),
        h('div', { class: 'item-meta' }, p.hq ? h('span', null, p.hq) : null, compAreas(p).map((r) => h('span', { class: 'pill' }, r.area + (r.overlap ? ' · ' + r.overlap : '')))),
        h('p', { class: 'about' }, p.about || ''),
        h('div', { class: 'clinks' },
          safeUrl(p.website) ? link(p.website, 'Website: ' + new URL(p.website).hostname.replace(/^www\./, '')) : h('span', { class: 'muted' }, 'Website not confirmed'),
          safeUrl(p.linkedin) ? link(p.linkedin, 'LinkedIn') : h('span', { class: 'muted' }, 'LinkedIn page not confirmed')),
        h('p', { class: 'mhead' }, 'Latest moves'),
        mine.length ? h('ul', { class: 'mlist' }, mine.map((m) => h('li', null, moveMeta(m, false), link(m.url, m.headline)))) : h('p', { class: 'muted' }, 'No move found yet.'));
    }) : [h('p', { class: 'empty' }, 'No competitors match these filters.')]));
  }
  document.getElementById('cw-csv').addEventListener('click', () => {
    const rows = cwProfiles().map((p) => {
      const m = state.moves.find((x) => x.profile === p.id) || {};
      return { competitor: p.competitor, hq: p.hq, areas: compAreas(p).map((r) => r.area).join('; '), about: p.about, website: p.website, linkedin: p.linkedin, move: m.headline || '', date: m.date || '', url: m.url || '' };
    });
    download(`pivotpath-competitor-profiles-${stamp()}.csv`, csv(rows, [['Competitor', 'competitor'], ['Headquarters', 'hq'], ['Competes with', 'areas'], ['About', 'about'], ['Website', 'website'], ['LinkedIn', 'linkedin'], ['Latest move', 'move'], ['Date', 'date'], ['Move URL', 'url']]));
  });

  /* ---------- sites ---------- */
  function renderSites() {
    const t = document.getElementById('sites-table');
    const head = h('thead', null, h('tr', null, ['Website', 'Product or service', 'What to watch', 'Last checked', 'Latest finding'].map((c) => h('th', null, c))));
    const body = h('tbody', null, state.sites.map((r) => h('tr', null, h('td', null, link(r.url, r.label || r.url)), h('td', null, r.area || 'General'), h('td', null, r.notes || ''), h('td', { class: 'nowrap' }, r.last_checked ? fmtDate(r.last_checked) : 'Not yet'), h('td', null, r.last_finding || ''))));
    if (!state.sites.length) body.append(h('tr', null, h('td', { colspan: '5', class: 'muted' }, 'No websites tracked yet.')));
    t.replaceChildren(head, body);
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

  /* ---------- major tabs ---------- */
  const MAJORS = ['market-watch', 'competitor-watch'];
  let major = location.hash.slice(1) === 'competitor-watch' ? 'competitor-watch' : 'market-watch';
  function showMajor(id, push) {
    major = id;
    document.querySelectorAll('.major').forEach((p) => { p.hidden = p.id !== id; });
    document.querySelectorAll('.mtab').forEach((b) => { const on = b.dataset.major === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    if (push) history.replaceState(null, '', '#' + (id === 'market-watch' ? current : id));
  }
  document.querySelectorAll('.mtab').forEach((b) => {
    b.addEventListener('click', () => showMajor(b.dataset.major, true));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const n = MAJORS[(MAJORS.indexOf(b.dataset.major) + 1) % MAJORS.length];
      showMajor(n, true);
      document.querySelector(`.mtab[data-major="${n}"]`).focus();
    });
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
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (TABS.includes(id)) { showMajor('market-watch', false); showTab(id, false); } else if (MAJORS.includes(id)) showMajor(id, false); });
  document.getElementById('print-btn').addEventListener('click', () => window.print());

  /* ---------- render ---------- */
  function renderScope(sc) { renderFeed(sc); if (sc === 'products' || sc === 'services') renderComp(sc); }
  function renderAll() {
    renderHeader(); renderFilters();
    ['ai', 'products', 'services', 'reg'].forEach(renderFeed);
    ['products', 'services'].forEach((sc) => { renderBars(sc); renderComp(sc); });
    renderFda(); renderSites(); renderCwFilters(); renderCw();
    document.getElementById('k-wl').textContent = String(state.fda.filter((r) => r.doc_type === 'Warning letter').length);
  }

  (async () => {
    showTab(current, false); showMajor(major, false);
    try {
      await loadData();
      renderAll();
    } catch (e) {
      document.getElementById('lede').textContent = 'The data could not be loaded. Please refresh the page; if this persists, tell the marketing team.';
      console.error(e);
    }
  })();
})();
