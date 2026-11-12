const $ = (id) => document.getElementById(id);
const url = $('url');
let state = { tabs: [], activeId: null }, lastActive = null, seq = 0;

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k));
  return n;
}

function render(s) {
  state = s;
  const tabs = $('tabs');
  tabs.replaceChildren(...s.tabs.map((t) => {
    const icon = t.loading ? el('i') : t.favicon ? el('img', { src: t.favicon }) : el('i', { style: 'animation:none;border-color:transparent;background:var(--hover)' });
    const close = el('b', { textContent: '×', title: 'Close tab' });
    close.onclick = (e) => { e.stopPropagation(); shell.cmd('closeTab', t.id); };
    const tab = el('div', { className: 'tab' + (t.id === s.activeId ? ' on' : ''), title: t.title || t.url }, icon, el('span', { textContent: t.title || t.url || 'New Tab' }), close);
    tab.onmousedown = (e) => { if (e.button === 1) { e.preventDefault(); shell.cmd('closeTab', t.id); } else if (e.button === 0) shell.cmd('activate', t.id); };
    tab.oncontextmenu = () => shell.cmd('tabMenu', t.id);
    return tab;
  }));
  const a = s.tabs.find((t) => t.id === s.activeId);
  $('back').disabled = !a || !a.canGoBack;
  $('fwd').disabled = !a || !a.canGoForward;
  $('reload').textContent = a && a.loading ? '✕' : '⟳';
  $('star').textContent = s.bookmarked ? '★' : '☆';
  $('star').classList.toggle('on', !!s.bookmarked);
  const shown = a ? a.display : '';
  $('lock').textContent = shown.startsWith('https:') ? '🔒' : shown.startsWith('http:') ? 'Not secure' : '';
  if (s.activeId !== lastActive || document.activeElement !== url) url.value = shown;
  lastActive = s.activeId;
}

$('new').onclick = () => shell.cmd('newTab');
$('back').onclick = () => shell.cmd('back');
$('fwd').onclick = () => shell.cmd('forward');
$('reload').onclick = () => shell.cmd('reload');
$('star').onclick = () => shell.cmd('bookmark');
$('menu').onclick = () => shell.cmd('menu');
$('strip').ondblclick = (e) => { if (e.target.id === 'strip') shell.cmd('newTab'); };
url.onfocus = () => url.select();
url.onkeydown = (e) => {
  if (e.key === 'Enter') { shell.cmd('go', url.value); url.blur(); }
  else if (e.key === 'Escape') { render(state); url.blur(); }
};
url.oninput = async () => {
  const n = ++seq;
  const list = await shell.suggest(url.value);
  if (n !== seq) return;
  $('sug').replaceChildren(...list.map((v) => el('option', { value: v.url, label: v.title })));
};
shell.onState(render);
shell.onFocusUrl(() => url.focus());
