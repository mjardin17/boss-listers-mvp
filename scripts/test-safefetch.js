// node --test scripts/test-safefetch.js
// Proves lib/safeFetch.js refuses internal targets. No outbound network: DNS is
// mocked through the injectable `lookup`, and IP literals never hit DNS at all.

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertSafeUrl, isBlockedIp, safeFetch, UnsafeUrlError } = require("../lib/safeFetch");

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const mapTo = (address) => async () => [{ address, family: address.includes(":") ? 6 : 4 }];

async function blocked(url, lookup = publicLookup) {
  await assert.rejects(() => assertSafeUrl(url, { lookup }), UnsafeUrlError, `should block ${url}`);
}

test("blocks IPv4 literals: loopback, private, metadata, CGNAT, unspecified", async () => {
  for (const url of [
    "https://127.0.0.1/",
    "https://127.1.2.3/x",
    "https://10.0.0.5/",
    "https://172.16.0.1/",
    "https://172.31.255.255/",
    "https://192.168.1.1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://100.64.0.1/",
    "https://100.127.255.254/",
    "https://0.0.0.0/",
  ]) {
    await blocked(url);
  }
});

test("blocks IPv6 literals: loopback, ULA, link-local, v4-mapped", async () => {
  for (const url of [
    "https://[::1]/",
    "https://[::]/",
    "https://[fc00::1]/",
    "https://[fd12:3456::1]/",
    "https://[fe80::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:10.1.2.3]/",
    "https://[::ffff:169.254.169.254]/",
  ]) {
    await blocked(url);
  }
});

test("blocks alternate IPv4 spellings that WHATWG URL normalizes", async () => {
  await blocked("https://2130706433/"); // decimal 127.0.0.1
  await blocked("https://0x7f.1/"); // hex
  await blocked("https://017700000001/"); // octal
});

test("blocks localhost and internal-only names", async () => {
  for (const url of ["https://localhost/", "https://app.localhost/", "https://printer.local/", "https://db.internal/"]) {
    await blocked(url);
  }
});

test("blocks hostnames that RESOLVE to internal addresses (incl. one bad record among good)", async () => {
  await blocked("https://evil.example.com/", mapTo("127.0.0.1"));
  await blocked("https://evil.example.com/", mapTo("169.254.169.254"));
  await blocked("https://evil.example.com/", mapTo("100.64.10.10"));
  await blocked("https://evil.example.com/", mapTo("::1"));
  await blocked("https://evil.example.com/", async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]);
});

test("blocks non-https schemes, credentials, odd ports, unresolvable hosts", async () => {
  await blocked("http://example.com/");
  await blocked("ftp://example.com/");
  await blocked("file:///etc/passwd");
  await blocked("https://user:pw@example.com/");
  await blocked("https://example.com:8080/");
  await blocked("not a url");
  await blocked("https://nx.example.com/", async () => {
    throw new Error("ENOTFOUND");
  });
});

test("allows a public https host (validation step only, no network)", async () => {
  const { url, addresses } = await assertSafeUrl("https://example.com/product?id=1", { lookup: publicLookup });
  assert.equal(url.hostname, "example.com");
  assert.deepEqual(addresses, ["93.184.216.34"]);
  const lit = await assertSafeUrl("https://93.184.216.34/");
  assert.deepEqual(lit.addresses, ["93.184.216.34"]);
  const v6 = await assertSafeUrl("https://example.com/", { lookup: mapTo("2606:2800:220:1:248:1893:25c8:1946") });
  assert.equal(v6.addresses.length, 1);
});

test("isBlockedIp edge cases: range boundaries and fail-closed", () => {
  assert.equal(isBlockedIp("172.15.255.255"), false);
  assert.equal(isBlockedIp("172.32.0.0"), false);
  assert.equal(isBlockedIp("100.63.255.255"), false);
  assert.equal(isBlockedIp("100.128.0.0"), false);
  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
  assert.equal(isBlockedIp("garbage"), true);
});

test("safeFetch rejects a private target before any connection is made", async () => {
  await assert.rejects(() => safeFetch("https://127.0.0.1/"), UnsafeUrlError);
  await assert.rejects(() => safeFetch("https://169.254.169.254/latest/meta-data/"), UnsafeUrlError);
  await assert.rejects(
    () => safeFetch("https://rebind.example.com/", { lookup: mapTo("10.0.0.1") }),
    UnsafeUrlError
  );
});
