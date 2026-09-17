// Resolves where test artifacts (preview.html, screenshots) are written.
//
// Deliberately OUTSIDE the repository so a test run never dirties the working
// tree. Override with EDP_TEST_OUT if you want the artifacts somewhere you can
// inspect them.
const fs = require('fs'), os = require('os'), path = require('path');
const dir = process.env.EDP_TEST_OUT || path.join(os.tmpdir(), 'edp-register-test');
fs.mkdirSync(dir, { recursive: true });
module.exports = dir;
