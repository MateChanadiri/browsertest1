const fs = require('fs');
const path = require('path');

// Tiny JSON file store. Writes are atomic (tmp + rename); a corrupt file is kept as .corrupt, not overwritten.
class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') try { fs.copyFileSync(file, file + '.corrupt'); } catch {}
      this.data = structuredClone(defaults);
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { JsonStore };
