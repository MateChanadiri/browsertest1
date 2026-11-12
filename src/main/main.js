const { app, BrowserWindow, WebContentsView, Menu, ipcMain, clipboard } = require('electron');
const path = require('path');
const cfg = require('../../browser.config.json');
const { resolveInput, ENGINES } = require('./omnibox');
const { JsonStore } = require('./store');

app.setName(cfg.productName);
const CHROME_H = 84;
const NEWTAB = require('url').pathToFileURL(path.join(__dirname, '../ui/newtab.html')).href;
const isWeb = (u) => /^https?:/i.test(u);

let win, settings, bookmarks, history, sessionStore;
let tabs = [], activeId = null, nextId = 1, closed = [], htmlFullscreen = false;

const active = () => tabs.find((t) => t.id === activeId);
const display = (t) => { const u = t.failedUrl || t.url; return u === NEWTAB ? '' : u; };

// ---- state -> UI, session save ----
let pushTimer, saveTimer;
function push() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    const a = active();
    win.webContents.send('state', {
      activeId,
      bookmarked: !!a && bookmarks.data.items.some((b) => b.url === display(a)),
      tabs: tabs.map((t) => {
        const nh = t.view.webContents.navigationHistory;
        return { id: t.id, title: t.title, favicon: t.favicon, loading: t.loading, display: display(t), url: display(t),
          canGoBack: !t.lazy && nh.canGoBack(), canGoForward: !t.lazy && nh.canGoForward() };
      })
    });
    win.setTitle((a && a.title ? a.title + ' — ' : '') + cfg.productName);
  }, 16);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 500);
}
function saveSession() {
  sessionStore.data = { active: Math.max(0, tabs.findIndex((t) => t.id === activeId)), tabs: tabs.map((t) => ({ url: t.failedUrl || t.url, title: t.title })) };
  sessionStore.save();
}

// ---- history / bookmarks ----
function visit(url, title) {
  const e = history.data.entries;
  const h = e[url] || (e[url] = { url, title: '', visits: 0 });
  h.visits++; h.last = Date.now(); if (title) h.title = title;
  const keys = Object.keys(e);
  if (keys.length > 5000) keys.sort((a, b) => e[a].last - e[b].last).slice(0, 500).forEach((k) => delete e[k]);
  history.save();
}
function suggest(text) {
  const q = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!q.length) return [];
  const hit = (o) => q.every((w) => (o.url + ' ' + (o.title || '')).toLowerCase().includes(w));
  const seen = new Set(), out = [];
  const hist = Object.values(history.data.entries).filter(hit).sort((a, b) => b.visits - a.visits || b.last - a.last);
  for (const o of [...bookmarks.data.items.filter(hit), ...hist]) if (!seen.has(o.url) && out.push(o)) seen.add(o.url);
  return out.slice(0, 8).map(({ url, title }) => ({ url, title: title || '' }));
}

// ---- layout ----
function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  const top = htmlFullscreen ? 0 : CHROME_H;
  for (const t of tabs) t.view.setBounds({ x: 0, y: top, width: w, height: Math.max(0, h - top) });
}

// ---- tabs ----
function createTab(url = NEWTAB, { activate = true, lazy = false, title = '' } = {}) {
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:default' } });
  const tab = { id: nextId++, view, url, title, favicon: '', loading: false, lazy, failedUrl: null };
  const wc = view.webContents;
  tabs.push(tab);
  win.contentView.addChildView(view);
  view.setVisible(false);

  wc.setWindowOpenHandler(({ url: u }) => { if (isWeb(u)) createTab(u); return { action: 'deny' }; });
  wc.on('page-title-updated', (_e, t) => { tab.title = t; if (isWeb(tab.url)) visit(tab.url, t); push(); });
  wc.on('page-favicon-updated', (_e, f) => { tab.favicon = f[0] || ''; push(); });
  wc.on('did-start-loading', () => { tab.loading = true; push(); });
  wc.on('did-stop-loading', () => { tab.loading = false; push(); });
  const nav = (u) => { if (u.startsWith('data:')) return; tab.url = u; tab.failedUrl = null; tab.favicon = ''; if (isWeb(u)) visit(u, wc.getTitle()); push(); };
  wc.on('did-navigate', (_e, u) => nav(u));
  wc.on('did-navigate-in-page', (_e, u, main) => main && nav(u));
  wc.on('did-fail-load', (_e, code, desc, u, main) => {
    if (!main || code === -3) return;
    tab.failedUrl = u;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      `<meta charset=utf-8><title>Can’t reach this page</title><style>:root{color-scheme:light dark}body{font:16px system-ui;max-width:560px;margin:15vh auto;padding:0 20px}h1{font-weight:500}code{opacity:.7}</style><h1>Can’t reach this page</h1><p>${esc(u)}</p><code>${esc(desc)}</code>`));
  });
  wc.on('render-process-gone', () => { tab.failedUrl = tab.failedUrl || tab.url; tab.loading = false; push(); });
  wc.on('enter-html-full-screen', () => { htmlFullscreen = true; win.setFullScreen(true); layout(); });
  wc.on('leave-html-full-screen', () => { htmlFullscreen = false; win.setFullScreen(false); layout(); });
  wc.on('context-menu', (_e, p) => {
    const nh = wc.navigationHistory, items = [];
    if (p.linkURL) items.push({ label: 'Open link in new tab', click: () => createTab(p.linkURL, { activate: false }) }, { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
    if (p.selectionText) items.push({ role: 'copy' });
    if (p.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' });
    items.push({ label: 'Back', enabled: nh.canGoBack(), click: () => nh.goBack() }, { label: 'Forward', enabled: nh.canGoForward(), click: () => nh.goForward() }, { label: 'Reload', click: () => wc.reload() },
      { type: 'separator' }, { label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  if (!lazy) wc.loadURL(url).catch(() => {});
  if (activate) activateTab(tab.id);
  push();
  return tab;
}
function activateTab(id) {
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  activeId = id;
  tabs.forEach((x) => x.view.setVisible(x.id === id));
  if (t.lazy) { t.lazy = false; t.view.webContents.loadURL(t.url).catch(() => {}); }
  layout();
  if (t.url === NEWTAB) t.view.webContents.focus();
  push();
}
function closeTab(id = activeId) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = tabs[i];
  if (t.url !== NEWTAB) { closed.push({ url: t.failedUrl || t.url, title: t.title }); closed = closed.slice(-25); }
  tabs.splice(i, 1);
  win.contentView.removeChildView(t.view);
  t.view.webContents.close();
  if (!tabs.length) return win.close();
  if (id === activeId) activateTab(tabs[Math.min(i, tabs.length - 1)].id);
  push();
}
function go(input) {
  const u = resolveInput(input, settings.data.engine);
  const a = active();
  if (!u || !a) return;
  a.lazy = false; a.failedUrl = null;
  a.view.webContents.loadURL(u).catch(() => {});
  a.view.webContents.focus();
}
function toggleBookmark() {
  const a = active(), u = a && display(a);
  if (!u) return;
  const items = bookmarks.data.items, i = items.findIndex((b) => b.url === u);
  if (i >= 0) items.splice(i, 1); else items.push({ url: u, title: a.title || u, added: Date.now() });
  bookmarks.save(); push();
}
const switchBy = (d) => { const i = tabs.findIndex((t) => t.id === activeId); activateTab(tabs[(i + d + tabs.length) % tabs.length].id); };

const cmds = {
  newTab: () => { const t = createTab(); win.webContents.send('focus-url'); return t; },
  closeTab, activate: activateTab, go, bookmark: toggleBookmark,
  back: () => { const a = active(); a && a.view.webContents.navigationHistory.canGoBack() && a.view.webContents.navigationHistory.goBack(); },
  forward: () => { const a = active(); a && a.view.webContents.navigationHistory.canGoForward() && a.view.webContents.navigationHistory.goForward(); },
  reload: () => { const a = active(); if (!a) return; if (a.loading) a.view.webContents.stop(); else if (a.failedUrl) go(a.failedUrl); else a.view.webContents.reload(); },
  reopen: () => { const c = closed.pop(); if (c) createTab(c.url, { title: c.title }); },
  focusUrl: () => win.webContents.send('focus-url'),
  next: () => switchBy(1), prev: () => switchBy(-1),
  devtools: () => { const a = active(); a && a.view.webContents.openDevTools({ mode: 'detach' }); },
  tabMenu: (id) => Menu.buildFromTemplate([
    { label: 'Duplicate tab', click: () => { const t = tabs.find((x) => x.id === id); t && createTab(t.failedUrl || t.url); } },
    { label: 'Reopen closed tab', enabled: closed.length > 0, click: cmds.reopen },
    { type: 'separator' }, { label: 'Close tab', click: () => closeTab(id) }
  ]).popup({ window: win }),
  menu: () => {
    const open = (u) => () => createTab(u);
    const recent = Object.values(history.data.entries).sort((a, b) => b.last - a.last).slice(0, 15);
    const list = (arr) => arr.length ? arr.map((o) => ({ label: (o.title || o.url).slice(0, 60), click: open(o.url) })) : [{ label: '(empty)', enabled: false }];
    Menu.buildFromTemplate([
      { label: 'New tab', click: cmds.newTab }, { label: 'Reopen closed tab', enabled: closed.length > 0, click: cmds.reopen },
      { type: 'separator' },
      { label: 'Bookmarks', submenu: list(bookmarks.data.items) }, { label: 'History', submenu: list(recent) },
      { label: 'Search engine', submenu: Object.keys(ENGINES).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), type: 'radio', checked: settings.data.engine === k, click: () => { settings.data.engine = k; settings.save(); } })) },
      { type: 'separator' }, { label: 'Developer tools', click: cmds.devtools }, { label: 'Quit', role: 'quit' }
    ]).popup({ window: win, x: win.getContentSize()[0] - 40, y: 40 });
  }
};

function buildMenu() {
  const item = (accelerator, fn) => ({ label: accelerator, accelerator, click: fn, visible: false });
  const nth = (n) => item('CmdOrCtrl+' + n, () => { const t = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]; t && activateTab(t.id); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Browser', submenu: [
    item('CmdOrCtrl+T', cmds.newTab), item('CmdOrCtrl+W', () => closeTab()), item('CmdOrCtrl+Shift+T', cmds.reopen),
    item('CmdOrCtrl+L', cmds.focusUrl), item('F6', cmds.focusUrl), item('Alt+D', cmds.focusUrl),
    item('CmdOrCtrl+R', cmds.reload), item('F5', cmds.reload), item('CmdOrCtrl+D', toggleBookmark),
    item('Alt+Left', cmds.back), item('Alt+Right', cmds.forward),
    item('Ctrl+Tab', cmds.next), item('Ctrl+Shift+Tab', cmds.prev), item('F12', cmds.devtools),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(nth)
  ] }]));
}

// ---- startup ----
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    if (win.isMinimized()) win.restore();
    win.focus();
    const u = argv.slice(1).find((a) => /^https?:\/\//i.test(a));
    if (u) createTab(u);
  });
  app.whenReady().then(() => {
    const dir = path.join(app.getPath('userData'), 'profiles', 'default');
    settings = new JsonStore(path.join(dir, 'settings.json'), { engine: cfg.defaultSearchEngine, bounds: { width: 1280, height: 800 } });
    bookmarks = new JsonStore(path.join(dir, 'bookmarks.json'), { items: [] });
    history = new JsonStore(path.join(dir, 'history.json'), { entries: {} });
    sessionStore = new JsonStore(path.join(dir, 'session.json'), { tabs: [], active: 0 });

    win = new BrowserWindow({ ...settings.data.bounds, minWidth: 480, minHeight: 320, title: cfg.productName, autoHideMenuBar: true, backgroundColor: '#1f2024',
      webPreferences: { preload: path.join(__dirname, '../preload.js'), sandbox: true, contextIsolation: true } });
    win.loadFile(path.join(__dirname, '../ui/index.html'));
    win.on('resize', layout);
    win.on('close', () => {
      saveSession();
      if (!win.isMaximized() && !win.isFullScreen()) { settings.data.bounds = win.getNormalBounds(); settings.save(); }
    });
    buildMenu();

    ipcMain.on('cmd', (e, name, arg) => { if (e.sender === win.webContents && Object.hasOwn(cmds, name)) cmds[name](arg); });
    ipcMain.handle('suggest', (e, text) => (e.sender === win.webContents ? suggest(text) : []));
    win.webContents.on('did-finish-load', push);

    // deny every web permission request until a permission UI exists (Stage 2)
    require('electron').session.fromPartition('persist:default').setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'fullscreen'));

    const arg = process.argv.slice(1).find((a) => /^https?:\/\//i.test(a));
    const saved = sessionStore.data;
    saved.tabs.forEach((t, i) => createTab(t.url, { activate: false, lazy: i !== saved.active, title: t.title }));
    if (tabs.length) activateTab(tabs[Math.min(saved.active, tabs.length - 1)].id);
    if (arg || !tabs.length) createTab(arg || NEWTAB);
  });
  app.on('window-all-closed', () => app.quit());
}
