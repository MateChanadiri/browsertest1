// Launches the real app, drives the real UI, checks real navigation. Needs a display (xvfb-run on Linux).
// On Linux as root, set E2E_NO_SANDBOX=1.
const { _electron } = require('playwright-core');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  if (req.url === '/b') return res.end('<title>Page B</title>b');
  res.end('<title>Page A</title><a id=l target=_blank href="/b">blank</a>');
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await sleep(100); } throw new Error('timeout: ' + what); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
  const launch = () => _electron.launch({ args: [path.join(__dirname, '../..'), `--user-data-dir=${dir}`, ...(process.env.E2E_NO_SANDBOX ? ['--no-sandbox', '--disable-gpu'] : [])] });
  const pages = (app) => app.evaluate(({ webContents }) => webContents.getAllWebContents().filter((w) => w.getType() === 'webview' || /^(https?|data|file):/.test(w.getURL())).map((w) => [w.getURL(), w.getTitle()]));
  const web = async (app) => (await pages(app)).filter(([u]) => u.startsWith('http'));

  let app = await launch();
  let ui = await app.firstWindow();
  await ui.waitForSelector('.tab');
  console.log('ok  window + first tab');

  await ui.fill('#url', `${base}/`); await ui.press('#url', 'Enter');
  await until(async () => (await web(app)).some(([u, t]) => u === `${base}/` && t === 'Page A'), 'navigate');
  console.log('ok  real navigation');
  await until(async () => (await ui.textContent('.tab.on span')) === 'Page A', 'tab title in UI');
  console.log('ok  tab title shown in UI');

  await ui.click('#new'); await until(async () => (await ui.locator('.tab').count()) === 2, 'new tab');
  console.log('ok  new tab');
  await ui.fill('#url', `${base}/b`); await ui.press('#url', 'Enter');
  await until(async () => (await ui.textContent('.tab.on span')) === 'Page B', 'tab 2 nav');
  await ui.locator('.tab').first().dispatchEvent('mousedown', { button: 0 });
  await until(async () => (await ui.textContent('.tab.on span')) === 'Page A', 'switch tab');
  console.log('ok  tab switching');

  await ui.fill('#url', `${base}/b`); await ui.press('#url', 'Enter');
  await until(async () => (await ui.textContent('.tab.on span')) === 'Page B', 'nav b');
  await until(async () => !(await ui.locator('#back').isDisabled()), 'back enabled');
  await ui.click('#back');
  await until(async () => (await ui.textContent('.tab.on span')) === 'Page A', 'back');
  console.log('ok  back');

  await ui.click('#star'); await until(async () => (await ui.textContent('#star')) === '★', 'bookmark');
  console.log('ok  bookmark');

  await ui.fill('#url', 'http://127.0.0.1:1/'); await ui.press('#url', 'Enter');
  await until(async () => (await pages(app)).some(([u]) => u.startsWith('data:text/html')), 'error page');
  assert.strictEqual(await ui.inputValue('#url'), 'http://127.0.0.1:1/');
  console.log('ok  error page keeps address');

  await ui.screenshot({ path: path.join(__dirname, 'screenshot.png') });
  await app.close(); await sleep(800);

  const p = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'profiles/default', f)));
  assert.ok(p('bookmarks.json').items.some((b) => b.url === `${base}/`), 'bookmark saved');
  assert.ok(p('history.json').entries[`${base}/`].visits >= 1, 'history saved');
  assert.strictEqual(p('session.json').tabs.length, 2);
  console.log('ok  bookmarks, history, session written to disk');

  app = await launch(); ui = await app.firstWindow();
  await ui.waitForSelector('.tab');
  await until(async () => (await ui.locator('.tab').count()) === 2, 'restore 2 tabs');
  console.log('ok  session restore');
  await app.close(); server.close();
  console.log('ALL E2E PASSED');
})().catch((e) => { console.error('E2E FAILED:', e); process.exit(1); });
