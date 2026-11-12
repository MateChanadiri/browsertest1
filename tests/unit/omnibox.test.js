const test = require('node:test');
const assert = require('node:assert');
const { resolveInput } = require('../../src/main/omnibox');

const cases = [
  ['example.com', 'https://example.com'],
  ['https://a.b/c?d=1', 'https://a.b/c?d=1'],
  ['localhost:3000', 'http://localhost:3000'],
  ['192.168.1.1', 'http://192.168.1.1'],
  ['hello world', 'https://www.google.com/search?q=hello%20world'],
  ['cats', 'https://www.google.com/search?q=cats'],
  ['javascript:alert(1)', 'https://www.google.com/search?q=javascript%3Aalert(1)'],
  ['', null]
];
for (const [i, o] of cases) test(`resolve "${i}"`, () => assert.strictEqual(resolveInput(i), o));
test('engine choice', () => assert.match(resolveInput('x y', 'duckduckgo'), /^https:\/\/duckduckgo\.com\/\?q=x%20y$/));
