import { scoreExtension, summarise } from './risk.js';

const $ = (id) => document.getElementById(id);

function item(className, left, right, rightClass) {
  const li = document.createElement('li');
  const a = document.createElement('span');
  a.className = className;
  a.textContent = left;
  const b = document.createElement('span');
  if (rightClass) b.className = rightClass;
  b.textContent = right;
  li.append(a, b);
  return li;
}

async function load() {
  const selfId = chrome.runtime.id;
  const all = await chrome.management.getAll();
  const rows = all.map((info) => ({ info, risk: scoreExtension(info) }));
  const s = summarise(rows);

  $('headline').textContent = s.needsReview === 0
    ? 'No extension is rated High or Critical.'
    : s.needsReview + (s.needsReview === 1 ? ' extension is' : ' extensions are') + ' rated High or Critical.';

  $('counts').replaceChildren(
    item('', 'Installed', String(s.total)),
    item('', 'Switched on', String(s.enabled)),
    item('', 'Can run on every website', String(s.allSites)),
    item('', 'Not installed from a store', String(s.notStore))
  );

  const top = rows
    .filter((row) => row.info.enabled && row.info.id !== selfId && row.risk.score >= 15)
    .sort((a, b) => b.risk.score - a.risk.score)
    .slice(0, 3);
  $('top-title').hidden = top.length === 0;
  $('top').replaceChildren(...top.map((row) => item('n', row.info.name, row.risk.level + ' ' + row.risk.score, 'lvl ' + row.risk.level)));
}

$('open').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
  window.close();
});

load().catch((err) => {
  $('headline').textContent = 'Could not read the installed extensions: ' + (err && err.message ? err.message : 'unknown error');
});
