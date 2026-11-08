#!/usr/bin/env node
// JSON over stdin, no credentials on argv, no dotenv/config-file loading.
const { normalizeIdentification, estimateEbay } = require('../lib/cardFactoryAdapters');
async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 2_000_000) throw new Error('Input too large');
  }
  const request = JSON.parse(input);
  if (request.operation === 'normalize') return normalizeIdentification(request.identification);
  if (request.operation === 'price') return estimateEbay({
    identification: request.identification, allowNetwork: request.allowNetwork, verifiedIdentity: request.verifiedIdentity === true
  });
  throw new Error('Unsupported operation');
}
main().then(result => process.stdout.write(JSON.stringify(result))).catch(() => {
  process.stderr.write('Card factory adapter rejected the request. Check input and dependencies.\n');
  process.exitCode = 1;
});
