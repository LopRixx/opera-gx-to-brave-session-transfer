import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../extension/lib/cookies-core.js";

const NOW = 1_800_000_000;
const SECRET = "TOP-SECRET-VALUE";
const mk = (o) => ({ name: "sid", value: SECRET, domain: ".example.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: false, expirationDate: NOW + 1000, ...o });
const all = (...hosts) => new Set(hosts);

test("normalizeCookie : deduit hostOnly du domaine et rejette l invalide", () => {
  assert.equal(core.normalizeCookie(mk({})).hostOnly, false);
  assert.equal(core.normalizeCookie(mk({ domain: "example.com" })).hostOnly, true);
  assert.equal(core.normalizeCookie(null), null);
  assert.equal(core.normalizeCookie(mk({ path: "x" })), null);
  assert.equal(core.normalizeCookie(mk({ domain: "" })), null);
  assert.equal(core.normalizeCookie(mk({ sameSite: "bizarre" })).sameSite, "unspecified");
});

test("cookie sans expirationDate = cookie de session", () => {
  const c = core.normalizeCookie(mk({ session: undefined, expirationDate: undefined }));
  assert.equal(c.session, true); assert.equal("expirationDate" in c, false);
});

test("selectForExport : partitionnes, session, domaines", () => {
  const raws = [
    mk({}), mk({ domain: "other.com" }), mk({ name: "s", session: true, expirationDate: undefined }),
    mk({ name: "p", partitionKey: { topLevelSite: "https://a.com" } }), { junk: 1 },
  ];
  const r = core.selectForExport(raws, { domains: all("example.com"), includeSession: false });
  assert.equal(r.cookies.length, 1);
  assert.deepEqual(r.skipped, { partitioned: 1, invalid: 1, not_selected: 1, session_excluded: 1, expired: 0, exists: 0 });
  const r2 = core.selectForExport(raws, { domains: all("example.com"), includeSession: true });
  assert.equal(r2.cookies.length, 2);
});

test("buildSetDetails : domaine vs host-only, schema de l URL, expiration", () => {
  const d1 = core.buildSetDetails(core.normalizeCookie(mk({})));
  assert.equal(d1.url, "https://example.com/"); assert.equal(d1.domain, ".example.com"); assert.equal(d1.httpOnly, true);
  const d2 = core.buildSetDetails(core.normalizeCookie(mk({ domain: "www.example.com", secure: false, path: "/a", sameSite: "unspecified" })));
  assert.equal(d2.url, "http://www.example.com/a"); assert.equal("domain" in d2, false);
  const d3 = core.buildSetDetails(core.normalizeCookie(mk({ session: true, expirationDate: undefined })));
  assert.equal("expirationDate" in d3, false);
});

test("regles __Host-, __Secure-, SameSite=None sans Secure", () => {
  assert.equal(core.setRuleViolation(core.normalizeCookie(mk({ name: "__Host-a", domain: "example.com" }))), null);
  assert.equal(core.setRuleViolation(core.normalizeCookie(mk({ name: "__Host-a" }))), "invalid"); // domaine => pas host-only
  assert.equal(core.setRuleViolation(core.normalizeCookie(mk({ name: "__Host-a", domain: "example.com", path: "/x" }))), "invalid");
  assert.equal(core.setRuleViolation(core.normalizeCookie(mk({ name: "__Secure-a", secure: false }))), "invalid");
  assert.equal(core.setRuleViolation(core.normalizeCookie(mk({ sameSite: "no_restriction", secure: false }))), "invalid");
  assert.equal(core.setRuleViolation(core.normalizeCookie(mk({ sameSite: "no_restriction" }))), null);
});

test("planImport : expires, existants conserves, options", () => {
  const cookies = [
    mk({ name: "a" }), mk({ name: "old", expirationDate: NOW - 1 }), mk({ name: "dup" }),
    mk({ name: "sess", session: true, expirationDate: undefined }), mk({ name: "z", domain: "no.com" }),
    mk({ name: "__Secure-x", secure: false }),
  ].map(core.normalizeCookie);
  const existing = new Set(["dup|.example.com|/"]);
  const base = { domains: all("example.com") };
  const p = core.planImport(cookies, existing, base, NOW);
  assert.deepEqual(p.items.map((i) => i.details.name), ["a"]);
  assert.deepEqual(p.skipped, { partitioned: 0, invalid: 1, not_selected: 1, session_excluded: 1, expired: 1, exists: 1 });
  const p2 = core.planImport(cookies, existing, { ...base, overwrite: true, includeSession: true }, NOW);
  assert.deepEqual(p2.items.map((i) => i.details.name).sort(), ["a", "dup", "sess"]);
});

test("runImport : succes, null, exception ; aucune valeur dans les stats", async () => {
  const items = ["ok", "null", "throw"].map((n) => ({ key: n, host: "example.com", details: { name: n, value: SECRET } }));
  const setFn = async (d) => { if (d.name === "throw") throw new Error("refuse"); return d.name === "null" ? null : { ...d }; };
  const r = await core.runImport(items, setFn);
  assert.equal(r.imported, 1); assert.equal(r.failed, 2);
  assert.deepEqual(r.perDomain["example.com"], { imported: 1, failed: 2 });
  assert.ok(!JSON.stringify(r).includes(SECRET));
});

test("reloginDomains", () => {
  const out = core.reloginDomains(["a.com", "b.com", "c.com", "d.com"], { "a.com": { imported: 3, failed: 0 }, "b.com": { imported: 0, failed: 2 }, "c.com": { imported: 2, failed: 1 } });
  assert.deepEqual(out.map((o) => o.domain), ["b.com", "c.com", "d.com"]);
});

test("validatePayload", () => {
  assert.throws(() => core.validatePayload({ format: "autre" }));
  const r = core.validatePayload({ format: "session-transfer", version: 1, createdAt: "2026-10-25T00:00:00Z", source: "Opera", cookies: [mk({}), { x: 1 }] });
  assert.equal(r.cookies.length, 1); assert.equal(r.invalid, 1);
});

test("domainStats et presets", () => {
  const st = core.domainStats([mk({}), mk({ name: "b" }), mk({ domain: "twitch.tv" })].map(core.normalizeCookie));
  assert.deepEqual(st, [{ domain: "example.com", count: 2 }, { domain: "twitch.tv", count: 1 }]);
  const g = core.PRESETS.find((p) => p.id === "google");
  assert.ok(g.test("accounts.google.be") && g.test("youtube.com") && g.test("google.co.uk") && !g.test("notgoogle.com.evil.io"));
  assert.ok(core.PRESETS.find((p) => p.id === "discord").test("discord.com"));
});
