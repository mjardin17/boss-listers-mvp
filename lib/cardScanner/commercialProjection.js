'use strict';
// Phase 1B server-only service, not an API or an authentication implementation.
// preview(session, ids) MUST receive the existing withSession/resolveSession
// server context separately from client input. Never pass req.body as session
// or configuration. No token is forwarded to the worker. No endpoint is wired.
// Server configuration uses the existing Card Factory root and enable flag.
// Existing store/service constructors are deliberately not imported.
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { buildCardCommercial, buildBoundCardCommercial } = require('../cardCommercial');
const ROOT = path.resolve(__dirname, '../..');
const WORKER = path.join(ROOT, 'scripts/card_factory/commercial_readonly.py');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODES = new Set(['INVALID_SELECTION','STORE_UNAVAILABLE','STORE_BUSY','PRIVATE_PATH_INVALID','READONLY_PLATFORM_UNSUPPORTED',
  'WAL_OR_JOURNAL_UNSUPPORTED','DATABASE_READ_FAILED','UNSUPPORTED_SCHEMA','STORE_CHANGED','EVIDENCE_CHANGED',
  'ASSET_READ_FAILED','SELECTION_NOT_FOUND','RESPONSE_TOO_LARGE','RESOURCE_LIMIT','SNAPSHOT_STALE','RUNTIME_UNVERIFIED']);
const EXCLUSIONS = new Set(['NEEDS_REVIEW','REVIEW_UNVERIFIED','REVIEW_MISMATCH','INVALID_STOCK','NO_AVAILABLE_STOCK',
  'TITLE_UNVERIFIED','SNAPSHOT_INVALID','IMAGE_ASSOCIATION_INVALID','IMAGE_MISSING','IMAGE_INTEGRITY_INVALID','EVIDENCE_INVALID']);
function fail(code) {
  const error = new Error(`Local commercial preview refused (${code}).`);
  error.code = code;
  throw error;
}
function selection(input) {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) fail('INVALID_SELECTION');
  const fields = Object.getOwnPropertyDescriptors(input), length = fields.length.value;
  if (length > 50 || Reflect.ownKeys(fields).length !== length + 1) fail('INVALID_SELECTION');
  const ids = [];
  for (let i = 0; i < length; i++) {
    const descriptor = fields[String(i)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor,'value') ||
        typeof descriptor.value !== 'string' || !UUID.test(descriptor.value)) fail('INVALID_SELECTION');
    ids.push(descriptor.value);
  }
  if (new Set(ids).size !== ids.length) fail('INVALID_SELECTION');
  return ids;
}
// Process-wide limits across every service instance; no unbounded waiting queue.
const activeWorkers = new Set();
let quarantined = false;
const HASH = /^[0-9a-f]{64}$/;
const privateManifests = new WeakMap();
function errorFor(code, cleanupComplete) {
  const error = new Error(`Local commercial preview refused (${code}).`);
  error.code = code;
  if (cleanupComplete !== undefined) error.cleanupComplete = cleanupComplete;
  return error;
}

function validatedRuntime(env) {
  // Explicit deployment pins, never PATH discovery. No inherited Python/site
  // environment. The executable and its deployment/stdlib remain trusted OS
  // inputs; this is not a sandbox against an administrator replacing them.
  const python = env.CARD_FACTORY_PYTHON;
  const hash = env.CARD_FACTORY_PYTHON_SHA256;
  const version = env.CARD_FACTORY_PYTHON_VERSION;
  const sqlite = env.CARD_FACTORY_SQLITE_VERSION;
  if (process.platform !== 'linux' || typeof python !== 'string' || !path.isAbsolute(python) ||
      typeof hash !== 'string' || !HASH.test(hash) ||
      typeof version !== 'string' || !/^3\.(?:11|12|13)\.\d+$/.test(version) ||
      typeof sqlite !== 'string' || !/^3\.\d+\.\d+$/.test(sqlite)) fail('RUNTIME_UNVERIFIED');
  let fd;
  try {
    if (fs.realpathSync(python) !== python) fail('RUNTIME_UNVERIFIED');
    // Runtime ancestors must not be writable by other principals.
    for (let parent = path.dirname(python); ; parent = path.dirname(parent)) {
      const info = fs.lstatSync(parent);
      if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o022) ||
          ![0, process.getuid()].includes(info.uid)) fail('RUNTIME_UNVERIFIED');
      if (parent === '/') break;
    }
    fd = fs.openSync(python, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || info.size > 64*1024*1024 || (info.mode & 0o022) ||
        !(info.mode & 0o111) || ![0, process.getuid()].includes(info.uid)) fail('RUNTIME_UNVERIFIED');
    const actual = createHash('sha256').update(fs.readFileSync(fd)).digest('hex');
    const after = fs.fstatSync(fd);
    if (actual !== hash || after.ino !== info.ino || after.size !== info.size || after.mtimeMs !== info.mtimeMs ||
        after.ctimeMs !== info.ctimeMs) fail('RUNTIME_UNVERIFIED');
    return {python, pythonVersion:version, sqliteVersion:sqlite};
  } catch { fail('RUNTIME_UNVERIFIED'); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

async function runWorker(runtime, request, {signal, timeoutMs=15000, termMs=250, killMs=1000}={}) {
  if (quarantined) throw errorFor('WORKER_CLEANUP_UNCONFIRMED', false);
  if (signal?.aborted) throw errorFor('CANCELLED', true);
  const input = JSON.stringify(request);
  if (Buffer.byteLength(input) > 16384) throw errorFor('INVALID_SELECTION', true);
  if (activeWorkers.size >= 2) throw errorFor('WORKER_LIMIT', true);
  return new Promise((resolve, reject) => {
    const record = {child:null};
    activeWorkers.add(record);
    let child, deadline, escalation, cleanupDeadline;
    let failure = null, settled = false, exited = false, stdoutSize = 0, stderrSize = 0;
    const chunks = [];
    const settle = (error, result) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve(result);
    };
    const cleanup = () => {
      clearTimeout(deadline); clearTimeout(escalation); clearTimeout(cleanupDeadline);
      signal?.removeEventListener('abort', onAbort);
      if (child) {
        child.stdout.removeListener('data', onData);
        child.stderr.removeListener('data', onStderr);
        child.stdin.removeListener('error', onStdinError);
        child.stdout.removeListener('error', onStreamError);
        child.stderr.removeListener('error', onStreamError);
        for (const stream of [child.stdin, child.stdout, child.stderr]) stream.destroy();
        child.removeListener('error', onError);
        child.removeListener('exit', onExit);
        child.removeListener('close', onClose);
      }
      activeWorkers.delete(record);
    };
    const finish = (error, result) => {
      cleanup();
      if (error) error.cleanupComplete = true;
      settle(error, result);
    };
    const kill = signalName => { try { child.kill(signalName); } catch { /* exit confirmation remains mandatory */ } };
    const terminate = code => {
      if (failure) return;
      failure = errorFor(code);
      clearTimeout(deadline);
      child.stdin.destroy();
      // Do not keep buffering while waiting for termination.
      chunks.length = 0;
      if (exited) { finish(failure); return; }
      kill('SIGTERM');
      escalation = setTimeout(() => kill('SIGKILL'), termMs);
      cleanupDeadline = setTimeout(() => {
        if (exited) return;
        quarantined = true;
        // A non-exiting worker remains tracked and consumes its slot. Never
        // report cleanup complete. Keep exit handlers until it is reaped.
        signal?.removeEventListener('abort', onAbort);
        for (const stream of [child.stdin, child.stdout, child.stderr]) stream.destroy();
        settle(errorFor('WORKER_CLEANUP_UNCONFIRMED', false));
      }, termMs + killMs);
    };
    function onAbort() { terminate('CANCELLED'); }
    function onStdinError() { terminate('DATABASE_READ_FAILED'); }
    function onStreamError() { terminate('DATABASE_READ_FAILED'); }
    function onData(chunk) {
      stdoutSize += chunk.length;
      if (stdoutSize > 131072) { terminate('RESPONSE_TOO_LARGE'); return; }
      if (!failure) chunks.push(Buffer.from(chunk));
    }
    function onStderr(chunk) {
      stderrSize += chunk.length;
      if (stderrSize > 131072) terminate('RESPONSE_TOO_LARGE');
    }
    function onError() {
      if (!child.pid) { finish(errorFor('DATABASE_READ_FAILED')); return; }
      terminate('DATABASE_READ_FAILED');
    }
    function onExit() {
      exited = true;
      if (failure) finish(failure);
    }
    function onClose(status) {
      exited = true;
      if (failure) { finish(failure); return; }
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!result || result.ok !== true || status !== 0) {
          finish(errorFor(CODES.has(result?.code) ? result.code : 'DATABASE_READ_FAILED')); return;
        }
        finish(null, result);
      } catch { finish(errorFor('DATABASE_READ_FAILED')); }
    }
    try {
      child = spawn(runtime.python, ['-I','-S','-B',WORKER], {
        cwd:ROOT, windowsHide:true, stdio:['pipe','pipe','pipe'], env:{LANG:'C.UTF-8'},
      });
      record.child = child;
      deadline = setTimeout(() => terminate('WORKER_TIMEOUT'), timeoutMs);
      child.stdout.on('data', onData);
      child.stderr.on('data', onStderr);
      child.stdin.on('error', onStdinError);
      child.stdout.on('error', onStreamError);
      child.stderr.on('error', onStreamError);
      child.on('error', onError); child.on('exit', onExit); child.on('close', onClose);
      signal?.addEventListener('abort', onAbort, {once:true});
      if (signal?.aborted) onAbort();
      else child.stdin.end(input);
    } catch {
      if (child?.pid) terminate('DATABASE_READ_FAILED');
      else finish(errorFor('DATABASE_READ_FAILED'));
    }
  });
}

function boundAsset(tenant, row, binding) {
  const bytes = createHash('sha256').update(`bosslisters:commercial-front:${tenant}:${row.itemId}:${row.snapshotHash}:${binding.frontSha256}`).digest().subarray(0,16);
  bytes[6] = (bytes[6] & 15) | 128; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `bl-private:asset:${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function checkedResponse(response, ids, tenant) {
  if (!response || typeof response.revision !== 'string' || !HASH.test(response.revision) ||
      !Array.isArray(response.rows) || !Array.isArray(response.excluded) ||
      response.rows.length + response.excluded.length !== ids.length) fail('DATABASE_READ_FAILED');
  const rows = [], bindings = [], excluded = [], positions = new Set();
  function position(value) {
    if (!Number.isInteger(value) || value < 0 || value >= ids.length || positions.has(value)) fail('DATABASE_READ_FAILED');
    positions.add(value);
  }
  for (const entry of response.excluded) {
    position(entry?.selectionIndex);
    if (!EXCLUSIONS.has(entry.reason)) fail('DATABASE_READ_FAILED');
    excluded.push({selectionIndex:entry.selectionIndex, reason:entry.reason});
  }
  for (const entry of response.rows.slice().sort((a,b) => a.selectionIndex-b.selectionIndex)) {
    position(entry?.selectionIndex);
    const row = entry.row, binding = entry.binding;
    if (row?.itemId !== ids[entry.selectionIndex] || !binding ||
        typeof binding.frontSha256 !== 'string' || !HASH.test(binding.frontSha256) ||
        typeof binding.backSha256 !== 'string' || !HASH.test(binding.backSha256) ||
        row.frontImage !== boundAsset(tenant, row, binding)) fail('SNAPSHOT_INVALID');
    // Manifest mismatches are request failures, not title-policy exclusions.
    const keys = ['itemId','title','titleVerified','quantity','needsReview','frontImage','snapshotHash'];
    if (Object.keys(binding).length !== 9 || keys.some(key => binding[key] !== row[key])) fail('SNAPSHOT_INVALID');
    try { buildCardCommercial([row]); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      excluded.push({selectionIndex:entry.selectionIndex, reason:'BUILDER_POLICY_REJECTED'}); continue;
    }
    rows.push(row); bindings.push(binding);
  }
  return {rows, bindings, excluded:excluded.sort((a,b) => a.selectionIndex-b.selectionIndex)};
}

function freezeData(value) {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freezeData(nested);
    Object.freeze(value);
  }
  return value;
}

function createCommercialProjection({env = process.env} = {}) {
  // Copy only non-secret deployment configuration; session and ids are separate.
  const config = Object.fromEntries(['BOSS_CARD_FACTORY_ROOT','CARD_FACTORY_LOCAL_ENABLED','CARD_FACTORY_PYTHON',
    'CARD_FACTORY_PYTHON_SHA256','CARD_FACTORY_PYTHON_VERSION','CARD_FACTORY_SQLITE_VERSION'].map(k => [k,env[k]]));
  return {
    async preview(session, clientSelection, {signal}={}) {
      if (!session || typeof session.tenantId !== 'string' || !UUID.test(session.tenantId) ||
          typeof session.userId !== 'string' || !UUID.test(session.userId) || session.role !== 'owner') fail('FORBIDDEN');
      const tenant = session.tenantId;
      const ids = selection(clientSelection);
      const root = config.BOSS_CARD_FACTORY_ROOT, publicRoot = path.join(ROOT,'public');
      if (config.CARD_FACTORY_LOCAL_ENABLED !== '1' || typeof root !== 'string' || !path.isAbsolute(root) ||
          path.resolve(root) === publicRoot || path.resolve(root).startsWith(publicRoot+path.sep)) fail('LOCAL_PREVIEW_DISABLED');
      let checked = {rows:[],bindings:[],excluded:[]}, revision = null;
      if (signal?.aborted) throw errorFor('CANCELLED',true);
      if (ids.length) {
        const runtime = validatedRuntime(config);
        const request = {root:path.resolve(root),tenant,ids,expected:null,
          runtime:{python:runtime.pythonVersion,sqlite:runtime.sqliteVersion}};
        const first = await runWorker(runtime, request, {signal});
        checkedResponse(first,ids,tenant);
        const second = await runWorker(validatedRuntime(config), {...request,expected:first.revision}, {signal});
        if (first.revision !== second.revision || JSON.stringify(first) !== JSON.stringify(second)) fail('SNAPSHOT_STALE');
        checked = checkedResponse(second,ids,tenant);
        revision = second.revision;
      }
      if (signal?.aborted) throw errorFor('CANCELLED',true);
      // No await/user callbacks between the fresh verification and construction.
      // Point-in-time only: no reservation or guarantee after returning. A future
      // asset consumer MUST revalidate; this phase has no resolver/serving route.
      const manifest = Object.freeze(checked.bindings.map(binding => Object.freeze({...binding})));
      const preview = {mode:'private-preview',published:false,
        availabilityBasis:'recorded-on-hand-minus-listed',reservationSupport:false,
        includedCount:checked.rows.length,excluded:checked.excluded,
        script:buildBoundCardCommercial(checked.rows,manifest)};
      if (Buffer.byteLength(JSON.stringify(preview),'utf8') > 65536) fail('RESPONSE_TOO_LARGE');
      privateManifests.set(preview,Object.freeze({revision,bindings:manifest}));
      return freezeData(preview);
    },
  };
}
// Internal server capability keyed by object identity, not an HTTP endpoint.
// Nothing is added to the enumerable/public preview or serialized output.
function getPrivatePreviewManifest(preview) { return privateManifests.get(preview); }
module.exports = { createCommercialProjection, getPrivatePreviewManifest };
