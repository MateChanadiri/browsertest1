const ENGINES = {
  google: 'https://www.google.com/search?q=%s',
  bing: 'https://www.bing.com/search?q=%s',
  duckduckgo: 'https://duckduckgo.com/?q=%s'
};

// Typed text -> URL to load. Anything that is not clearly a URL becomes a search.
function resolveInput(input, engine = 'google') {
  const s = String(input || '').trim();
  if (!s) return null;
  const search = () => (ENGINES[engine] || ENGINES.google).replace('%s', encodeURIComponent(s));
  if (/^(javascript|vbscript|data):/i.test(s)) return search();
  if (/^(https?|file):\/\//i.test(s) || s === 'about:blank') return s;
  if (!/\s/.test(s)) {
    try {
      const h = new URL('http://' + s).hostname;
      if (h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith('[')) return 'http://' + s;
      if (/\.([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(h)) return 'https://' + s;
    } catch {}
  }
  return search();
}

module.exports = { resolveInput, ENGINES };
