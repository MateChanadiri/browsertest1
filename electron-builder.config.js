// Product name comes from browser.config.json so the final brand can be set in one place.
const cfg = require('./browser.config.json');
module.exports = {
  appId: cfg.appId,
  productName: cfg.productName,
  directories: { output: 'dist' },
  files: ['src/**/*', 'browser.config.json', 'package.json'],
  win: { target: [{ target: 'zip', arch: ['x64'] }], signAndEditExecutable: false },
  artifactName: '${productName}-${version}-win-x64.${ext}'
};
