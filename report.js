import { scoreExtension, summarise, toCsv } from './risk.js';

const LABEL_KEY = 'rollcall.auditLabel';
const LEVEL_ORDER = { Critical: 3, High: 2, Medium: 1, Low: 0 };
const ACCESS_ORDER = { all: 3, many: 2, some: 1, none: 0 };

const state = {
  rows: [],
  auditedAt: null,
  sortKey: 'score',
  sortDir: -1,
  query: '',
  level: 'all',
  showDisabled: true,
  open: new Set(),
  label: '',
};

const $ = (id) => document.getElementById(id);

// Build elements with textContent only. Names and descriptions come from other
// extensions, so they are never inserted as HTML.
function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of [].concat(children || [])) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

function readLabel() {
  try {
    return localStorage.getItem(LABEL_KEY) || '';
  } catch (err) {
    return '';
  }
}

function saveLabel(value) {
  try {
    localStorage.setItem(LABEL_KEY, value);
  } catch (err) {
    // Storage can be unavailable; the label then lasts for this page only.
  }
}

function browserName() {
  const data = navigator.userAgentData;
  if (data && Array.isArray(data.brands)) {
    const brand = data.brands.find((b) => !/not.?a.?brand/i.test(b.brand) && b.brand !== 'Chromium') || data.brands.find((b) => b.brand === 'Chromium');
    if (brand) return brand.brand + ' ' + brand.version + (data.platform ? ' on ' + data.platform : '');
  }
  return navigator.userAgent;
}

function formatDate(date) {
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function permissionWarnings(id) {
  const api = chrome.management;
  const fn = api.getPermissionWarningById || api.getPermissionWarningsById;
  if (typeof fn !== 'function') return [];
  try {
    return (await fn.call(api, id)) || [];
  } catch (err) {
    return [];
  }
}

async function load() {
  const selfId = chrome.runtime.id;
  const all = await chrome.management.getAll();
  const rows = [];
  for (const info of all) {
    rows.push({
      info,
      risk: scoreExtension(info),
      isSelf: info.id === selfId,
      warnings: await permissionWarnings(info.id),
    });
  }
  state.rows = rows;
  state.auditedAt = new Date();
  render();
}

function matches(row) {
  if (!state.showDisabled && !row.info.enabled) return false;
  if (state.level !== 'all' && row.risk.level !== state.level) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.info.name, row.info.id, row.info.description || '', (row.info.permissions || []).join(' '), (row.info.hostPermissions || []).join(' ')].join(' ').toLowerCase();
  return haystack.includes(q);
}

function sortValue(row, key) {
  switch (key) {
    case 'name': return row.info.name.toLowerCase();
    case 'status': return row.info.enabled ? 1 : 0;
    case 'source': return row.risk.source.label.toLowerCase();
    case 'access': return ACCESS_ORDER[row.risk.access.kind] * 1000 + row.risk.access.count;
    default: return LEVEL_ORDER[row.risk.level] * 1000 + row.risk.score;
  }
}

function visibleRows() {
  const rows = state.rows.filter(matches);
  rows.sort((a, b) => {
    const av = sortValue(a, state.sortKey);
    const bv = sortValue(b, state.sortKey);
    if (av < bv) return -1 * state.sortDir;
    if (av > bv) return 1 * state.sortDir;
    return a.info.name.localeCompare(b.info.name);
  });
  return rows;
}

function tile(num, caption, alert) {
  return el('div', { class: 'tile' + (alert ? ' alert' : '') }, [el('div', { class: 'num', text: String(num) }), el('div', { class: 'cap', text: caption })]);
}

function renderTiles() {
  const s = summarise(state.rows);
  $('tiles').replaceChildren(
    tile(s.total, 'extensions installed'),
    tile(s.enabled, 'switched on'),
    tile(s.needsReview, 'rated High or Critical', s.needsReview > 0),
    tile(s.allSites, 'can run on every website'),
    tile(s.notStore, 'not installed from a store')
  );
}

function iconFor(info) {
  const icons = info.icons || [];
  const best = icons.slice().sort((a, b) => a.size - b.size).find((i) => i.size >= 32) || icons[icons.length - 1];
  const img = el('img', { alt: '', width: '24', height: '24' });
  if (best && best.url) {
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    img.src = best.url;
  } else {
    img.style.visibility = 'hidden';
  }
  return img;
}

function detailsRow(row) {
  const { info, risk } = row;
  const reasons = risk.reasons.length
    ? risk.reasons.map((r) => el('li', null, [el('span', { class: 'pts', text: (r.points > 0 ? '+' : '') + r.points }), r.text]))
    : [el('li', { text: 'Nothing adds to the score.' })];
  const perms = risk.permissions.length
    ? risk.permissions.map((p) => el('li', null, [el('span', { class: 'pts', text: '+' + p.points }), el('span', { class: 'mono', text: p.name }), ': ' + p.text]))
    : [el('li', { text: 'No browser feature permissions.' })];
  const hosts = (info.hostPermissions || []).length
    ? info.hostPermissions.map((h) => el('li', { class: 'mono', text: h }))
    : [el('li', { text: 'None' })];
  const warnings = row.warnings.length
    ? row.warnings.map((w) => el('li', { text: w }))
    : [el('li', { text: 'The browser shows no install warning for this extension.' })];

  const facts = [
    el('li', null, ['ID: ', el('span', { class: 'mono', text: info.id })]),
    el('li', { text: 'Type: ' + info.type }),
    el('li', { text: 'Source: ' + risk.source.label }),
  ];
  if (info.homepageUrl && /^https?:\/\//i.test(info.homepageUrl)) {
    facts.push(el('li', null, ['Homepage: ', el('a', { href: info.homepageUrl, target: '_blank', rel: 'noopener noreferrer', class: 'mono', text: info.homepageUrl })]));
  }
  if (!info.enabled && info.disabledReason) facts.push(el('li', { text: 'Disabled because: ' + info.disabledReason }));

  return el('tr', { class: 'details' }, el('td', { colspan: '6' }, [
    info.description ? el('p', { class: 'desc', text: info.description }) : null,
    el('div', { class: 'detail-grid' }, [
      el('div', null, [el('h3', { text: 'Why this rating' }), el('ul', null, reasons)]),
      el('div', null, [el('h3', { text: 'What it can use' }), el('ul', null, perms)]),
      el('div', null, [el('h3', { text: 'Websites it can run on' }), el('ul', null, hosts)]),
      el('div', null, [el('h3', { text: 'What the browser warns about' }), el('ul', null, warnings)]),
      el('div', null, [el('h3', { text: 'Facts' }), el('ul', null, facts)]),
    ]),
  ]));
}

function mainRow(row) {
  const { info, risk } = row;
  const open = state.open.has(info.id);
  const nameLine = el('div', null, [el('span', { class: 'name', text: info.name })]);
  if (row.isSelf) nameLine.append(el('span', { class: 'tag', text: 'this tool' }));
  if (info.type !== 'extension') nameLine.append(el('span', { class: 'tag', text: info.type.replace(/_/g, ' ') }));

  const toggleLabel = info.enabled ? 'Disable' : 'Enable';
  const canToggle = !row.isSelf && (info.enabled ? info.mayDisable : (info.mayEnable !== false));
  let toggleTitle = toggleLabel + ' ' + info.name;
  if (row.isSelf) toggleTitle = 'This tool cannot switch itself off';
  else if (!canToggle) toggleTitle = 'Managed by policy, so it cannot be changed here';

  return el('tr', { class: info.enabled ? '' : 'off' }, [
    el('td', null, el('div', { class: 'ext' }, [iconFor(info), el('div', null, [nameLine, el('div', { class: 'ver', text: 'v' + info.version })])])),
    el('td', { text: info.enabled ? 'On' : 'Off' }),
    el('td', { text: risk.source.label }),
    el('td', { text: risk.access.label }),
    el('td', null, [el('span', { class: 'badge ' + risk.level, text: risk.level }), el('span', { class: 'score', text: String(risk.score) })]),
    el('td', { class: 'no-print' }, el('div', { class: 'row-actions' }, [
      el('button', { type: 'button', class: 'small', 'aria-expanded': open ? 'true' : 'false', text: open ? 'Hide' : 'Details', onclick: () => toggleDetails(info.id) }),
      el('button', { type: 'button', class: 'small', disabled: !canToggle, title: toggleTitle, text: toggleLabel, onclick: () => setEnabled(info, !info.enabled) }),
    ])),
  ]);
}

function renderRows() {
  const rows = visibleRows();
  const body = $('rows');
  body.replaceChildren();
  for (const row of rows) {
    body.append(mainRow(row));
    if (state.open.has(row.info.id)) body.append(detailsRow(row));
  }
  $('empty').hidden = rows.length > 0;
  $('count').textContent = rows.length + ' of ' + state.rows.length + ' shown';
  for (const button of document.querySelectorAll('.sort')) {
    if (button.dataset.sort === state.sortKey) button.setAttribute('aria-sort', state.sortDir === 1 ? 'ascending' : 'descending');
    else button.removeAttribute('aria-sort');
  }
}

function renderMeta() {
  const when = state.auditedAt ? formatDate(state.auditedAt) : '';
  $('meta').textContent = 'Audit of ' + browserName() + ', ' + when + '. This browser profile only.';
  $('print-label').textContent = state.label ? 'Audit label: ' + state.label : '';
}

function render() {
  renderMeta();
  renderTiles();
  renderRows();
}

function toggleDetails(id) {
  if (state.open.has(id)) state.open.delete(id);
  else state.open.add(id);
  renderRows();
}

let toastTimer = null;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 5000);
}

async function setEnabled(info, enabled) {
  try {
    await chrome.management.setEnabled(info.id, enabled);
    await load();
    toast(info.name + (enabled ? ' is switched on.' : ' is switched off. Use Enable to bring it back.'));
  } catch (err) {
    toast('Could not change ' + info.name + ': ' + (err && err.message ? err.message : 'the browser refused.'));
  }
}

function download(filename, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileStem() {
  const d = state.auditedAt || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const label = state.label.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return 'extension-audit-' + stamp + (label ? '-' + label : '');
}

function exportCsv() {
  const meta = { label: state.label.trim(), auditedAt: state.auditedAt ? state.auditedAt.toISOString() : '' };
  // The leading BOM makes Excel read the file as UTF-8.
  download(fileStem() + '.csv', 'text/csv;charset=utf-8', '﻿' + toCsv(visibleRows(), meta));
}

function exportJson() {
  const payload = {
    tool: 'Extension Roll Call',
    version: chrome.runtime.getManifest().version,
    auditLabel: state.label.trim(),
    auditedAt: state.auditedAt ? state.auditedAt.toISOString() : null,
    browser: browserName(),
    summary: summarise(state.rows),
    extensions: visibleRows().map((row) => ({
      id: row.info.id,
      name: row.info.name,
      version: row.info.version,
      type: row.info.type,
      enabled: row.info.enabled,
      installType: row.info.installType,
      source: row.risk.source.label,
      siteAccess: row.risk.access.label,
      riskLevel: row.risk.level,
      riskScore: row.risk.score,
      reasons: row.risk.reasons,
      permissions: row.info.permissions || [],
      hostPermissions: row.info.hostPermissions || [],
      homepageUrl: row.info.homepageUrl || null,
    })),
  };
  download(fileStem() + '.json', 'application/json', JSON.stringify(payload, null, 2));
}

function wire() {
  state.label = readLabel();
  $('label').value = state.label;
  $('label').addEventListener('input', (event) => {
    state.label = event.target.value;
    saveLabel(state.label);
    renderMeta();
  });
  $('search').addEventListener('input', (event) => { state.query = event.target.value; renderRows(); });
  $('level').addEventListener('change', (event) => { state.level = event.target.value; renderRows(); });
  $('show-disabled').addEventListener('change', (event) => { state.showDisabled = event.target.checked; renderRows(); });
  $('refresh').addEventListener('click', () => load().catch(fail));
  $('csv').addEventListener('click', exportCsv);
  $('json').addEventListener('click', exportJson);
  $('print').addEventListener('click', () => window.print());
  for (const button of document.querySelectorAll('.sort')) {
    button.addEventListener('click', () => {
      const key = button.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = key === 'name' || key === 'source' ? 1 : -1; }
      renderRows();
    });
  }
}

function fail(err) {
  $('meta').textContent = 'Could not read the installed extensions: ' + (err && err.message ? err.message : 'unknown error');
}

wire();
load().catch(fail);
