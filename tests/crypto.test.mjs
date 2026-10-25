import test from "node:test";
import assert from "node:assert/strict";
import { encryptJson, decryptJson, validateEnvelope, parseEnvelopeText, CryptoError, toB64, fromB64 } from "../extension/lib/crypto.js";

const PASS = "correct horse battery staple";
const fast = { iterations: 100000 };
const payload = { a: 1, cookies: [{ name: "x", value: "SECRET-VALUE-123" }] };

test("aller-retour chiffrement/dechiffrement", async () => {
  const env = await encryptJson(payload, PASS, fast);
  assert.deepEqual(await decryptJson(env, PASS), payload);
});

test("parametres par defaut : 600000 iterations", async () => {
  const env = await encryptJson({ k: 1 }, PASS);
  assert.equal(env.kdf.iterations, 600000);
  assert.deepEqual(await decryptJson(env, PASS), { k: 1 });
});

test("le texte clair n apparait pas dans l enveloppe", async () => {
  const env = await encryptJson(payload, PASS, fast);
  assert.ok(!JSON.stringify(env).includes("SECRET-VALUE-123"));
});

test("mauvaise phrase de passe refusee", async () => {
  const env = await encryptJson(payload, PASS, fast);
  await assert.rejects(() => decryptJson(env, "wrong passphrase!!"), (e) => e instanceof CryptoError && e.code === "auth");
});

test("donnees alterees refusees", async () => {
  const env = await encryptJson(payload, PASS, fast);
  const bytes = fromB64(env.data); bytes[bytes.length - 1] ^= 1;
  await assert.rejects(() => decryptJson({ ...env, data: toB64(bytes) }, PASS), (e) => e.code === "auth");
});

test("en-tete altere (iterations) refuse", async () => {
  const env = await encryptJson(payload, PASS, fast);
  const tampered = { ...env, kdf: { ...env.kdf, iterations: 100001 } };
  await assert.rejects(() => decryptJson(tampered, PASS), (e) => e.code === "auth");
});

test("deux chiffrements du meme contenu different (sel et IV aleatoires)", async () => {
  const a = await encryptJson(payload, PASS, fast);
  const b = await encryptJson(payload, PASS, fast);
  assert.notEqual(a.data, b.data); assert.notEqual(a.kdf.salt, b.kdf.salt); assert.notEqual(a.cipher.iv, b.cipher.iv);
});

test("phrase de passe trop courte refusee", async () => {
  await assert.rejects(() => encryptJson(payload, "court", fast), (e) => e.code === "passphrase");
});

test("iterations hors limites refusees", async () => {
  await assert.rejects(() => encryptJson(payload, PASS, { iterations: 10 }), (e) => e.code === "params");
  const env = await encryptJson(payload, PASS, fast);
  assert.throws(() => validateEnvelope({ ...env, kdf: { ...env.kdf, iterations: 1e12 } }), CryptoError);
});

test("enveloppes invalides rejetees", () => {
  assert.throws(() => validateEnvelope(null), CryptoError);
  assert.throws(() => validateEnvelope({ app: "autre", v: 1 }), CryptoError);
  assert.throws(() => parseEnvelopeText("pas du json"), CryptoError);
  assert.throws(() => parseEnvelopeText(""), CryptoError);
});

test("base64 invalide rejete", () => {
  assert.throws(() => fromB64("***"), CryptoError);
});
