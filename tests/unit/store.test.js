const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { JsonStore } = require('../../src/main/store');

test('save, reload, and keep a corrupt file', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'st-')), 'a.json');
  const s = new JsonStore(f, { n: 0 });
  assert.deepStrictEqual(s.data, { n: 0 });
  s.data.n = 5; s.save();
  assert.strictEqual(new JsonStore(f, { n: 0 }).data.n, 5);
  fs.writeFileSync(f, '{bad');
  assert.deepStrictEqual(new JsonStore(f, { n: 0 }).data, { n: 0 });
  assert.strictEqual(fs.readFileSync(f + '.corrupt', 'utf8'), '{bad');
});
