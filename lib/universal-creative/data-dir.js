/**
 * Universal Creative — permanent storage location.
 *
 * Saved business data (CRM, campaigns, pipeline, revenue, automation,
 * Business Center, shared assets, learning, audit log) lives under
 *   $DATA_DIR/universal-creative/   (DATA_DIR is the Render persistent disk)
 * falling back to ./data/universal-creative locally, matching lib/store.js.
 *
 * Under `node --test` (NODE_TEST_CONTEXT is set) the OS temp folder is used
 * instead, so a test that forgets to set its own *_DIR can never write into
 * real data. Each module's own env override (CRM_DIR, CAMPAIGN_DIR, ...)
 * still wins over both.
 *
 * Scratch render output (temp images, videos, work dirs) stays in os.tmpdir().
 */

const os = require("os");
const path = require("path");

function dataRoot() {
  if (process.env.NODE_TEST_CONTEXT) return path.join(os.tmpdir(), "universal-creative-test-data");
  const base = process.env.DATA_DIR || path.join(process.cwd(), "data");
  return path.join(base, "universal-creative");
}

/**
 * @param {...string} parts path segments under the universal-creative data root
 * @returns {string}
 */
function dataPath(...parts) {
  return path.join(dataRoot(), ...parts);
}

module.exports = { dataRoot, dataPath };
