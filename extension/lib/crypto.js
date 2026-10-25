// Chiffrement du fichier intermediaire : PBKDF2-SHA256 -> AES-256-GCM (WebCrypto, natif au navigateur).
// La cle derive de la phrase de passe de l'utilisateur ; rien n'est stocke.

const APP = 'session-transfer';
const VERSION = 1;
export const DEFAULT_ITERATIONS = 600000;
export const MIN_ITERATIONS = 100000;
export const MAX_ITERATIONS = 10000000;
export const MIN_PASSPHRASE_LENGTH = 12;
const MAX_FILE_CHARS = 100 * 1024 * 1024;

export class CryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

const te = new TextEncoder();
const td = new TextDecoder();

export function toB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

export function fromB64(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
    throw new CryptoError('format', 'Champ base64 invalide.');
  }
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt, iterations, usage) {
  const base = await crypto.subtle.importKey(
    'raw', te.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

// Les parametres d'en-tete sont authentifies (AAD) : toute modification fait echouer le dechiffrement.
function aad(iterations) {
  return te.encode(`${APP}|${VERSION}|PBKDF2-SHA256|${iterations}|AES-256-GCM`);
}

export async function encryptJson(obj, passphrase, { iterations = DEFAULT_ITERATIONS } = {}) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new CryptoError('passphrase', `La phrase de passe doit contenir au moins ${MIN_PASSPHRASE_LENGTH} caracteres.`);
  }
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new CryptoError('params', 'Nombre d\'iterations hors limites.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations, 'encrypt');
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(iterations) }, key, te.encode(JSON.stringify(obj)));
  return {
    app: APP,
    v: VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    cipher: { name: 'AES-256-GCM', iv: toB64(iv) },
    data: toB64(new Uint8Array(ct)),
  };
}

export function parseEnvelopeText(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_FILE_CHARS) {
    throw new CryptoError('format', 'Fichier vide ou trop volumineux.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CryptoError('format', 'Ce fichier n\'est pas un export Session Transfer valide.');
  }
}

export function validateEnvelope(env) {
  const bad = (m) => { throw new CryptoError('format', m); };
  if (!env || typeof env !== 'object') bad('Enveloppe invalide.');
  if (env.app !== APP || env.v !== VERSION) bad('Format ou version non pris en charge.');
  const { kdf, cipher } = env;
  if (!kdf || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') bad('KDF non pris en charge.');
  if (!Number.isInteger(kdf.iterations) || kdf.iterations < MIN_ITERATIONS || kdf.iterations > MAX_ITERATIONS) {
    bad('Nombre d\'iterations hors limites.');
  }
  if (!cipher || cipher.name !== 'AES-256-GCM') bad('Algorithme non pris en charge.');
  const salt = fromB64(kdf.salt);
  const iv = fromB64(cipher.iv);
  if (salt.length !== 16 || iv.length !== 12) bad('Parametres de chiffrement invalides.');
  const data = fromB64(env.data);
  if (data.length < 16) bad('Donnees chiffrees invalides.');
  return { salt, iv, data, iterations: kdf.iterations };
}

export async function decryptJson(env, passphrase) {
  const { salt, iv, data, iterations } = validateEnvelope(env);
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new CryptoError('passphrase', 'Phrase de passe requise.');
  }
  const key = await deriveKey(passphrase, salt, iterations, 'decrypt');
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad(iterations) }, key, data);
  } catch {
    throw new CryptoError('auth', 'Phrase de passe incorrecte ou fichier altere.');
  }
  try {
    return JSON.parse(td.decode(plain));
  } catch {
    throw new CryptoError('format', 'Contenu dechiffre illisible.');
  }
}
