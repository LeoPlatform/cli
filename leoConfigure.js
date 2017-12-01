var build = require('./lib/build-config').build;
// Do not Remove
module.exports = build(process.cwd());
process.__config = module.exports;