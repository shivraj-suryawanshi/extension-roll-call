// Extension Roll Call: risk scoring.
// Pure functions with no browser APIs, so the same file runs in the extension and in tests.
// The rating describes how much access an extension has. It does not say an extension is malicious.

export const LEVELS = [
  { name: 'Critical', min: 60 },
  { name: 'High', min: 35 },
  { name: 'Medium', min: 15 },
  { name: 'Low', min: 0 },
];

// permission name -> [points, plain-English meaning]
export const PERMISSIONS = {
  debugger: [10, 'Attach a debugger to tabs, which can read or change anything on a page'],
  nativeMessaging: [10, 'Talk to programs installed on this computer'],
  proxy: [10, 'Route your web traffic through a server it chooses'],
  vpnProvider: [10, 'Act as a VPN for your traffic'],
  management: [10, 'See, enable and disable other extensions'],
  privacy: [10, 'Change browser privacy settings'],
  contentSettings: [10, 'Change site settings such as camera, cookies and JavaScript'],
  cookies: [10, 'Read and change cookies, including the ones that keep you signed in'],
  history: [10, 'Read and change your browsing history'],
  scripting: [10, 'Run its own code inside web pages'],
  userScripts: [10, 'Run user-supplied scripts inside web pages'],
  certificateProvider: [10, 'Supply security certificates for sign-in'],
  webRequestBlocking: [10, 'Block or rewrite web requests as they happen'],
  webRequest: [8, 'Watch the web requests your browser makes'],
  declarativeNetRequestWithHostAccess: [8, 'Block or redirect requests on the sites it can access'],
  clipboardRead: [8, 'Read what you copy to the clipboard'],
  tabCapture: [8, 'Record the picture and sound of a tab'],
  desktopCapture: [8, 'Record your screen'],
  pageCapture: [8, 'Save complete copies of pages you open'],
  platformKeys: [8, 'Use security certificates stored on this device'],
  tabs: [5, 'See the address and title of every open tab'],
  webNavigation: [5, 'See which pages you move between'],
  downloads: [5, 'Start downloads and see your download history'],
  bookmarks: [5, 'Read and change your bookmarks'],
  topSites: [5, 'See your most visited sites'],
  sessions: [5, 'See recently closed tabs and tabs on your other devices'],
  browsingData: [5, 'Delete browsing data such as history and cookies'],
  identity: [5, 'Ask for your Google account sign-in'],
  'identity.email': [5, 'See your email address'],
  geolocation: [5, 'Know your physical location'],
  processes: [5, 'See the processes the browser is running'],
  declarativeNetRequest: [5, 'Block or redirect web requests using fixed rules'],
  declarativeNetRequestFeedback: [5, 'See which of its blocking rules matched your requests'],
  readingList: [3, 'Read and change your reading list'],
  background: [2, 'Keep running after you close the browser window'],
  clipboardWrite: [2, 'Put text on the clipboard'],
  tabGroups: [2, 'Organise tabs into groups'],
  printing: [2, 'Send jobs to your printers'],
  ttsEngine: [2, 'Provide a text-to-speech voice'],
  activeTab: [1, 'Access the current tab, only when you click the extension'],
  notifications: [1, 'Show notifications'],
  idle: [1, 'Know when the computer is idle'],
  power: [1, 'Keep the computer awake'],
  search: [1, 'Run searches with your default search engine'],
  offscreen: [1, 'Open hidden pages for background work'],
  declarativeContent: [1, 'Show its button on matching pages'],
  favicon: [1, 'Read site icons'],
  gcm: [1, 'Receive push messages'],
  fontSettings: [1, 'Change browser font settings'],
  'system.cpu': [1, 'Read processor details'],
  'system.memory': [1, 'Read memory details'],
  'system.storage': [1, 'Read storage device details'],
  'system.display': [1, 'Read display details'],
  storage: [0, 'Save its own settings'],
  unlimitedStorage: [0, 'Save a large amount of its own data'],
  alarms: [0, 'Run tasks on a timer'],
  contextMenus: [0, 'Add items to the right-click menu'],
  sidePanel: [0, 'Show a side panel'],
  tts: [0, 'Read text aloud'],
};

const UNKNOWN_POINTS = 2;
const API_POINTS_CAP = 50;

const ALL_SITE_PATTERNS = new Set([
  '<all_urls>',
  '*://*/*',
  '*://*/',
  'http://*/*',
  'https://*/*',
]);

// Permissions that turn "can open every site" into "can read or change data on every site".
const DATA_ACCESS = ['cookies', 'webRequest', 'webRequestBlocking', 'scripting', 'userScripts', 'debugger', 'declarativeNetRequestWithHostAccess'];

// Extensions that the browser itself installs on new computers.
const PREINSTALLED = {
  ghbmnnjooekpmoecnnnilnnbdlolhkhi: 'Chrome', // Google Docs Offline
};

const STORE_HOSTS = [
  ['clients2.google.com', 'Chrome Web Store'],
  ['edge.microsoft.com', 'Edge Add-ons'],
];

export function levelFor(score) {
  for (const level of LEVELS) {
    if (score >= level.min) return level.name;
  }
  return 'Low';
}

export function describePermission(name) {
  const known = PERMISSIONS[name];
  if (known) return { name, points: known[0], text: known[1], known: true };
  return { name, points: UNKNOWN_POINTS, text: 'Uses the browser feature "' + name + '"', known: false };
}

export function siteAccess(hostPermissions) {
  const hosts = (hostPermissions || []).filter((h) => typeof h === 'string' && !h.startsWith('chrome://'));
  if (hosts.some((h) => ALL_SITE_PATTERNS.has(h))) {
    return { kind: 'all', count: hosts.length, points: 30, label: 'All websites' };
  }
  if (hosts.length > 10) {
    return { kind: 'many', count: hosts.length, points: 15, label: hosts.length + ' site patterns' };
  }
  if (hosts.length > 0) {
    return { kind: 'some', count: hosts.length, points: 5, label: hosts.length === 1 ? '1 site pattern' : hosts.length + ' site patterns' };
  }
  return { kind: 'none', count: 0, points: 0, label: 'No websites' };
}

export function sourceOf(info) {
  switch (info.installType) {
    case 'admin':
      return { key: 'policy', label: 'Installed by policy', points: -10, why: 'Installed by an administrator policy' };
    case 'development':
      return { key: 'developer', label: 'Developer mode', points: 10, why: 'Loaded unpacked in developer mode, so it has not been through store review' };
    case 'sideload': {
      const url = String(info.updateUrl || '');
      const fromStore = STORE_HOSTS.some(([host]) => url.includes(host));
      if (fromStore && PREINSTALLED[info.id]) {
        return { key: 'preinstalled', label: 'Pre-installed with ' + PREINSTALLED[info.id], points: 0, why: '' };
      }
      if (fromStore) {
        return { key: 'external', label: 'Added outside the browser', points: 5, why: 'Added by another program on this computer, though it updates from an official store' };
      }
      return { key: 'sideload', label: 'Added by other software', points: 15, why: 'Added by another program on this computer, and does not update from an official store' };
    }
    case 'other':
      return { key: 'other', label: 'Unknown source', points: 5, why: 'The browser cannot say how it was installed' };
    default: {
      const url = String(info.updateUrl || '');
      for (const [host, label] of STORE_HOSTS) {
        if (url.includes(host)) return { key: 'store', label, points: 0, why: '' };
      }
      return { key: 'offstore', label: 'Not from a store', points: 10, why: 'Does not update from the Chrome Web Store or Edge Add-ons' };
    }
  }
}

export function scoreExtension(info) {
  const source = sourceOf(info);
  const access = siteAccess(info.hostPermissions);
  const permissions = (info.permissions || []).map(describePermission).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  if (info.type === 'theme') {
    return { score: 0, level: 'Low', reasons: [{ points: 0, text: 'Themes only change how the browser looks' }], access, source, permissions };
  }

  const reasons = [];
  let score = 0;

  if (access.points > 0) {
    score += access.points;
    reasons.push({ points: access.points, text: access.kind === 'all' ? 'Can run on every website you visit' : 'Can run on ' + access.label });
  }

  const rawApi = permissions.reduce((sum, p) => sum + p.points, 0);
  const api = Math.min(rawApi, API_POINTS_CAP);
  score += api;
  for (const p of permissions) {
    if (p.points >= 5) reasons.push({ points: p.points, text: p.text });
  }
  if (rawApi > API_POINTS_CAP) {
    reasons.push({ points: API_POINTS_CAP - rawApi, text: 'Permission points are capped at ' + API_POINTS_CAP });
  }

  const names = new Set((info.permissions || []));
  const dataPerms = DATA_ACCESS.filter((p) => names.has(p));
  if (access.kind === 'all' && dataPerms.length > 0) {
    score += 10;
    reasons.push({ points: 10, text: 'Every-website access combined with ' + dataPerms.join(', ') + ', so it can read or change what you see and type on any site' });
  }

  if (source.points !== 0) {
    score += source.points;
    reasons.push({ points: source.points, text: source.why });
  }

  score = Math.max(0, Math.min(100, score));
  reasons.sort((a, b) => b.points - a.points);
  return { score, level: levelFor(score), reasons, access, source, permissions };
}

export function summarise(rows) {
  const out = { total: rows.length, enabled: 0, disabled: 0, allSites: 0, notStore: 0, levels: { Critical: 0, High: 0, Medium: 0, Low: 0 } };
  for (const row of rows) {
    if (row.info.enabled) out.enabled += 1;
    else out.disabled += 1;
    if (row.risk.access.kind === 'all') out.allSites += 1;
    if (['developer', 'external', 'sideload', 'other', 'offstore'].includes(row.risk.source.key)) out.notStore += 1;
    out.levels[row.risk.level] += 1;
  }
  out.needsReview = out.levels.Critical + out.levels.High;
  return out;
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  // Stop spreadsheet programs from treating a cell as a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  if (/[",\n\r]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export const CSV_HEADER = ['Audit label', 'Audited at', 'Name', 'Version', 'Status', 'Source', 'Site access', 'Risk level', 'Risk score', 'Permissions', 'Site patterns', 'Main reasons', 'Extension ID', 'Homepage'];

export function toCsv(rows, meta) {
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const row of rows) {
    const { info, risk } = row;
    lines.push([
      meta && meta.label ? meta.label : '',
      meta && meta.auditedAt ? meta.auditedAt : '',
      info.name,
      info.version,
      info.enabled ? 'Enabled' : 'Disabled',
      risk.source.label,
      risk.access.label,
      risk.level,
      risk.score,
      (info.permissions || []).join('; '),
      (info.hostPermissions || []).join('; '),
      risk.reasons.filter((r) => r.points > 0).slice(0, 3).map((r) => r.text).join(' | '),
      info.id,
      info.homepageUrl || '',
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
