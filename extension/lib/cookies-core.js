// Logique pure (sans acces a chrome.*) : testable sous Node.
// Aucune valeur de cookie ne doit jamais apparaitre dans les statistiques ou rapports produits ici.

export const SAME_SITE = new Set(['no_restriction', 'lax', 'strict', 'unspecified']);

export const SKIP_LABELS = {
  partitioned: 'Cookies partitionnés (non pris en charge)',
  invalid: 'Cookies invalides ou refusés par les règles du navigateur',
  not_selected: 'Domaines non sélectionnés',
  session_excluded: 'Cookies de session (exclus par choix)',
  expired: 'Cookies déjà expirés',
  exists: 'Cookies déjà présents (conservés tels quels)',
};

export const PRESETS = [
  { id: 'google', label: 'Google / YouTube', test: (h) => /(^|\.)google\.[a-z.]{2,6}$/.test(h) || /(^|\.)youtube(-nocookie)?\.com$/.test(h) },
  { id: 'twitch', label: 'Twitch', test: (h) => /(^|\.)twitch\.tv$/.test(h) },
  { id: 'discord', label: 'Discord', test: (h) => /(^|\.)(discord\.com|discordapp\.com|discord\.gg)$/.test(h) },
];

export const GENERAL_NOTES = [
  'Importer des cookies ne garantit pas une session active : un site peut lier la session à autre chose que les cookies (stockage local, empreinte de l\'appareil, adresse IP, jeton renouvelé à chaque usage).',
  'Discord Web conserve normalement son jeton dans le stockage local (localStorage), pas dans des cookies : une reconnexion est très probable (la connexion par QR code depuis l\'appli mobile est un moyen rapide).',
  'Google peut demander une vérification ou une reconnexion quand il détecte un nouvel appareil, même avec des cookies valides.',
  'Ne vous déconnectez PAS d\'un site dans Opera GX après l\'import : une déconnexion invalide la session côté serveur, donc aussi celle de Brave. Supprimez plutôt les données du site localement.',
];

export function hostOf(domain) {
  return String(domain).replace(/^\./, '');
}

export function cookieKey(c) {
  return `${c.name}|${c.domain}|${c.path}`;
}

export function emptyCounts() {
  return { partitioned: 0, invalid: 0, not_selected: 0, session_excluded: 0, expired: 0, exists: 0 };
}

// Normalise un cookie venu de chrome.cookies.getAll ou d'un fichier. Retourne null si inexploitable.
export function normalizeCookie(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { name, value, domain, path } = raw;
  if (typeof name !== 'string' || typeof value !== 'string') return null;
  if (typeof domain !== 'string' || domain.length === 0) return null;
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  const hasExp = typeof raw.expirationDate === 'number' && Number.isFinite(raw.expirationDate);
  const session = raw.session === true || !hasExp;
  const c = {
    name,
    value,
    domain,
    hostOnly: !domain.startsWith('.'),
    path,
    secure: raw.secure === true,
    httpOnly: raw.httpOnly === true,
    sameSite: SAME_SITE.has(raw.sameSite) ? raw.sameSite : 'unspecified',
    session,
  };
  if (!session) c.expirationDate = raw.expirationDate;
  return c;
}

// Regles de coherence que Chromium applique a chrome.cookies.set. Retourne un motif ou null.
export function setRuleViolation(c) {
  if (c.name.startsWith('__Host-') && !(c.secure && c.hostOnly && c.path === '/')) return 'invalid';
  if (c.name.startsWith('__Secure-') && !c.secure) return 'invalid';
  if (c.sameSite === 'no_restriction' && !c.secure) return 'invalid';
  return null;
}

export function buildSetDetails(c) {
  const host = hostOf(c.domain);
  const details = {
    url: `${c.secure ? 'https' : 'http'}://${host}${c.path}`,
    name: c.name,
    value: c.value,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
  };
  if (!c.hostOnly) details.domain = c.domain; // cookie de domaine ; sinon cookie "host-only" (domain omis)
  if (!c.session) details.expirationDate = c.expirationDate;
  return details;
}

export function domainStats(cookies) {
  const m = new Map();
  for (const c of cookies) {
    const h = hostOf(c.domain);
    m.set(h, (m.get(h) || 0) + 1);
  }
  return [...m.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

// Export : filtre les cookies bruts de chrome.cookies.getAll.
export function selectForExport(rawList, { domains, includeSession = false }) {
  const skipped = emptyCounts();
  const cookies = [];
  for (const raw of rawList) {
    if (raw && raw.partitionKey) { skipped.partitioned++; continue; }
    const c = normalizeCookie(raw);
    if (!c) { skipped.invalid++; continue; }
    if (!domains.has(hostOf(c.domain))) { skipped.not_selected++; continue; }
    if (c.session && !includeSession) { skipped.session_excluded++; continue; }
    cookies.push(c);
  }
  return { cookies, skipped };
}

export function validatePayload(p) {
  if (!p || typeof p !== 'object' || p.format !== 'session-transfer' || p.version !== 1 || !Array.isArray(p.cookies)) {
    throw new Error('Contenu de fichier non reconnu.');
  }
  const cookies = [];
  let invalid = 0;
  for (const raw of p.cookies) {
    const c = normalizeCookie(raw);
    if (c) cookies.push(c); else invalid++;
  }
  return { cookies, invalid, createdAt: typeof p.createdAt === 'string' ? p.createdAt : null, source: typeof p.source === 'string' ? p.source : null };
}

// Import : decide, cookie par cookie, ce qui sera ecrit. N'ecrase jamais l'existant sauf option explicite.
export function planImport(cookies, existingKeys, { domains, includeSession = false, overwrite = false }, nowSec) {
  const skipped = emptyCounts();
  const items = [];
  for (const c of cookies) {
    const host = hostOf(c.domain);
    if (!domains.has(host)) { skipped.not_selected++; continue; }
    if (c.session && !includeSession) { skipped.session_excluded++; continue; }
    if (!c.session && c.expirationDate <= nowSec) { skipped.expired++; continue; }
    if (setRuleViolation(c)) { skipped.invalid++; continue; }
    const key = cookieKey(c);
    if (!overwrite && existingKeys.has(key)) { skipped.exists++; continue; }
    items.push({ key, host, details: buildSetDetails(c) });
  }
  return { items, skipped };
}

// setFn : (details) => Promise<cookie|null>. Compte succes et echecs sans jamais conserver de valeur.
export async function runImport(items, setFn, onProgress = () => {}) {
  const perDomain = {};
  let imported = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const d = (perDomain[it.host] ||= { imported: 0, failed: 0 });
    try {
      const res = await setFn(it.details);
      if (res) { imported++; d.imported++; } else { failed++; d.failed++; }
    } catch {
      failed++; d.failed++;
    }
    if (i % 50 === 0) onProgress(i + 1, items.length);
  }
  onProgress(items.length, items.length);
  return { imported, failed, perDomain };
}

// Domaines choisis pour lesquels une reconnexion reste probable : aucun cookie importe, ou des echecs.
export function reloginDomains(selectedDomains, perDomain) {
  const out = [];
  for (const host of selectedDomains) {
    const d = perDomain[host];
    if (!d || d.imported === 0 || d.failed > 0) {
      out.push({ domain: host, reason: !d ? 'aucun cookie importé' : d.imported === 0 ? 'tous les cookies ont échoué' : `${d.failed} cookie(s) en échec` });
    }
  }
  return out.sort((a, b) => a.domain.localeCompare(b.domain));
}
