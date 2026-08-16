import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Push the scaffold to GitHub via the connected (approval-gated) connector.
 *
 *   node scripts/push-to-github.js
 *
 * Each createOrUpdateFileContents call is approval-gated by the platform:
 * an "Approve & Apply" button appears in the chat for every write.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  'README.md', '.env.example', '.gitignore', 'package.json',
  'src/index.js', 'src/config/env.js', 'src/config/platforms.js',
  'src/auth/oauth.js', 'src/gates/registry.js',
  'src/connectors/ebay.js', 'src/connectors/etsy.js',
  'src/connectors/whatnot.js', 'src/connectors/depop.js',
  'src/connectors/mercari.js', 'src/connectors/facebook.js',
  'scripts/oauth-token.js', 'scripts/check-products.js', 'scripts/push-to-github.js',
  'docs/01-credentials.md', 'docs/02-auth-flows.md',
  'docs/03-gate-approval.md', 'docs/04-facebook-marketplace.md', 'docs/05-ebay.md',
];

const REPO = process.env.GITHUB_REPO || 'mjardin17/boss-listers-mvp';
const PREFIX = process.env.GITHUB_PATH || 'marketplace-integration';

for (const p of files) {
  const content = readFileSync(join(ROOT, p), 'utf8');
  const args = JSON.stringify({
    repoFullname: REPO,
    path: `${PREFIX}/${p}`,
    fileContent: content,
    commitMessage: `Add marketplace-integration scaffold: ${p}`,
  });
  console.log(`=== UPLOADING ${p} ===`);
  const out = execFileSync(
    'node',
    ['/home/user/servers/connectors/run.mjs', 'github', 'createOrUpdateFileContents', args],
    { encoding: 'utf8' }
  );
  const lines = out.trim().split('\n');
  console.log(lines.slice(-4).join('\n') || '(no stdout)');
  console.log('');
}
