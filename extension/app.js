import { encryptJson, decryptJson, parseEnvelopeText, MIN_PASSPHRASE_LENGTH } from './lib/crypto.js';
import * as core from './lib/cookies-core.js';

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

// ---------------------------------------------------------------- Navigateur et vérifications

async function detectBrowser() {
  const ua = navigator.userAgent;
  const chromium = (ua.match(/Chrom(?:e|ium)\/(\d+)/) || [])[1] || '?';
  let name = 'Navigateur Chromium';
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function' && (await navigator.brave.isBrave())) name = 'Brave';
  } catch { /* ignoré */ }
  if (name !== 'Brave' && /\bOPR\//.test(ua)) name = 'Opera / Opera GX';
  return { name, chromium: Number(chromium) || 0 };
}

async function runChecks(listEl, expected) {
  listEl.replaceChildren();
  const add = (cls, text) => listEl.append(el('li', { class: cls }, text));
  const b = await detectBrowser();
  $('browser-info').textContent = `Navigateur détecté : ${b.name} (Chromium ${b.chromium})`;
  const wrongWay = (expected === 'export' && b.name === 'Brave') || (expected === 'import' && b.name === 'Opera / Opera GX');
  add(wrongWay ? 'ko' : 'ok', wrongWay
    ? `Vous êtes dans ${b.name} : ce n'est pas le sens habituel pour cette opération (export depuis Opera GX, import dans Brave).`
    : `Navigateur : ${b.name}`);
  add(b.chromium >= 119 ? 'ok' : 'ko', b.chromium >= 119 ? 'Version de Chromium suffisante (119 ou plus).' : 'Version de Chromium inférieure à 119 : certaines fonctions peuvent manquer.');
  const apiOk = !!(globalThis.chrome && chrome.cookies && typeof chrome.cookies.getAll === 'function');
  add(apiOk ? 'ok' : 'ko', apiOk ? 'API chrome.cookies disponible.' : 'API chrome.cookies indisponible : l\'outil ne peut pas fonctionner ici.');
  let hostsOk = false;
  try { hostsOk = await chrome.permissions.contains({ origins: ['<all_urls>'] }); } catch { /* ignoré */ }
  add(hostsOk ? 'ok' : 'ko', hostsOk ? 'Accès aux cookies de tous les sites accordé.' : 'Accès aux sites non accordé : dans la page des extensions, autorisez l\'accès à tous les sites pour cette extension.');
  add(typeof chrome.downloads?.download === 'function' ? 'ok' : 'info', typeof chrome.downloads?.download === 'function'
    ? 'API de téléchargement disponible.' : 'API de téléchargement absente : un lien de téléchargement classique sera utilisé.');
  try {
    const priv = await chrome.extension.isAllowedIncognitoAccess();
    add(priv ? 'ko' : 'ok', priv ? 'L\'extension est autorisée en navigation privée : désactivez cette option.' : 'Navigation privée non autorisée pour l\'extension.');
  } catch { add('info', 'Statut navigation privée non vérifiable.'); }
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    add('info', `Magasins de cookies du profil : ${stores.length} (seul le magasin par défaut est traité).`);
  } catch { add('ko', 'Lecture des magasins de cookies impossible.'); }
  return { apiOk, hostsOk };
}

// ---------------------------------------------------------------- Sélecteur de domaines

function createPicker(container, stats) {
  container.replaceChildren();
  const checked = new Set();
  const total = stats.reduce((n, s) => n + s.count, 0);
  const filter = el('input', { type: 'search', placeholder: 'Filtrer les domaines…' });
  const summary = el('p', { class: 'muted' });
  const presets = el('div', { class: 'presets' });
  const list = el('div', { class: 'domlist' });

  const refreshSummary = () => {
    const n = stats.filter((s) => checked.has(s.domain)).reduce((a, s) => a + s.count, 0);
    summary.textContent = `${checked.size} domaine(s) sélectionné(s) — ${n} cookie(s) sur ${total}.`;
  };
  const renderList = () => {
    list.replaceChildren();
    const q = filter.value.trim().toLowerCase();
    for (const s of stats) {
      if (q && !s.domain.includes(q)) continue;
      const cb = el('input', { type: 'checkbox' });
      cb.checked = checked.has(s.domain);
      cb.addEventListener('change', () => { cb.checked ? checked.add(s.domain) : checked.delete(s.domain); refreshSummary(); picker.onChange(); });
      list.append(el('label', { class: 'dom' }, cb, el('span', { class: 'dname' }, s.domain), el('span', { class: 'dcount' }, s.count)));
    }
  };
  const mkBtn = (label, fn) => { const b = el('button', { type: 'button' }, label); b.addEventListener('click', () => { fn(); renderList(); refreshSummary(); picker.onChange(); }); return b; };

  for (const p of core.PRESETS) presets.append(mkBtn(`+ ${p.label}`, () => stats.forEach((s) => { if (p.test(s.domain)) checked.add(s.domain); })));
  presets.append(mkBtn('Tout sélectionner', () => stats.forEach((s) => checked.add(s.domain))));
  presets.append(mkBtn('Aucun', () => checked.clear()));
  filter.addEventListener('input', renderList);

  container.append(el('div', { class: 'picker' }, presets, filter, list, summary));
  const picker = { getSelected: () => new Set(checked), onChange: () => {} };
  renderList(); refreshSummary();
  return picker;
}

// ---------------------------------------------------------------- Rapports (jamais de valeurs de cookies)

function renderReport(container, title, rows, extras = []) {
  container.replaceChildren();
  const box = el('div', { class: 'report-box' }, el('strong', {}, title));
  const tbl = el('table', { class: 'report' });
  for (const [label, n] of rows) tbl.append(el('tr', {}, el('td', {}, label), el('td', {}, n)));
  box.append(tbl);
  for (const ex of extras) {
    if (!ex.items.length) continue;
    box.append(el('div', {}, el('strong', {}, ex.title)), el('ul', {}, ...ex.items.map((t) => el('li', {}, t))));
  }
  container.append(box);
}

function skippedRows(skipped) {
  return Object.entries(core.SKIP_LABELS).filter(([k]) => skipped[k] > 0).map(([k, label]) => [label, skipped[k]]);
}

// ---------------------------------------------------------------- Onglets

function showTab(which) {
  $('panel-export').hidden = which !== 'export';
  $('panel-import').hidden = which !== 'import';
  $('tab-export').classList.toggle('active', which === 'export');
  $('tab-import').classList.toggle('active', which === 'import');
  runChecks(which === 'export' ? $('checks') : $('checks-import'), which);
}
$('tab-export').addEventListener('click', () => showTab('export'));
$('tab-import').addEventListener('click', () => showTab('import'));

// ---------------------------------------------------------------- EXPORT

let rawCookies = [];
let expPicker = null;
let lastDownloadId = null;

function updateExportButton() {
  const ok = $('exp-profile').checked && $('exp-ack').checked && expPicker && expPicker.getSelected().size > 0
    && $('exp-pass').value.length >= MIN_PASSPHRASE_LENGTH && $('exp-pass').value === $('exp-pass2').value;
  $('exp-run').disabled = !ok;
}
['exp-profile', 'exp-ack', 'exp-pass', 'exp-pass2'].forEach((id) => $(id).addEventListener('input', updateExportButton));

$('exp-scan').addEventListener('click', async () => {
  try {
    rawCookies = await chrome.cookies.getAll({});
  } catch (e) {
    $('exp-scan-info').textContent = 'Lecture des cookies impossible : ' + (e && e.message ? e.message : 'erreur inconnue');
    return;
  }
  const partitioned = rawCookies.filter((c) => c && c.partitionKey).length;
  const usable = rawCookies.map(core.normalizeCookie).filter((c, i) => c && !rawCookies[i].partitionKey);
  $('exp-scan-info').textContent = `${rawCookies.length} cookie(s) lus par l'API, dont ${partitioned} partitionné(s) (ignorés). Valeurs jamais affichées. Sélectionnez uniquement les sites dont vous voulez conserver la session.`;
  expPicker = createPicker($('exp-domains'), core.domainStats(usable));
  expPicker.onChange = updateExportButton;
  $('exp-domains').hidden = false;
  $('exp-session-row').hidden = false;
  updateExportButton();
});

$('exp-gen').addEventListener('click', () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  const phrase = chars.match(/.{4}/g).join('-');
  $('exp-pass').value = phrase;
  $('exp-pass2').value = phrase;
  $('exp-gen-out').textContent = `Notez-la ailleurs que sur ce PC : ${phrase}`;
  updateExportButton();
});

function fileStamp() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    if (typeof chrome.downloads?.download === 'function') {
      return await chrome.downloads.download({ url, filename, saveAs: true, conflictAction: 'uniquify' });
    }
    const a = el('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

$('exp-run').addEventListener('click', async () => {
  $('exp-run').disabled = true;
  try {
    const selected = expPicker.getSelected();
    const { cookies, skipped } = core.selectForExport(rawCookies, { domains: selected, includeSession: $('exp-session').checked });
    if (cookies.length === 0) throw new Error('Aucun cookie à exporter avec cette sélection.');
    const payload = { format: 'session-transfer', version: 1, createdAt: new Date().toISOString(), source: (await detectBrowser()).name, cookies };
    const envelope = await encryptJson(payload, $('exp-pass').value);
    const blob = new Blob([JSON.stringify(envelope)], { type: 'application/octet-stream' });
    lastDownloadId = await saveBlob(blob, `session-transfer-${fileStamp()}.stx`);
    renderReport($('exp-report'), 'Export terminé', [['Cookies exportés', cookies.length], ['Domaines', new Set(cookies.map((c) => core.hostOf(c.domain))).size], ...skippedRows(skipped)], [
      { title: 'À savoir', items: ['Le fichier .stx est chiffré mais donne accès à vos comptes une fois déchiffré : ne le laissez pas traîner.', 'Les cookies partitionnés ne sont pas transférés.'] },
    ]);
    $('exp-delete').hidden = lastDownloadId === null;
    // Effacement des secrets de la mémoire de la page
    rawCookies = [];
    $('exp-pass').value = ''; $('exp-pass2').value = ''; $('exp-gen-out').textContent = '';
  } catch (e) {
    renderReport($('exp-report'), 'Export échoué', [], [{ title: 'Raison', items: [e && e.message ? e.message : 'erreur inconnue'] }]);
  } finally {
    updateExportButton();
  }
});

$('exp-delete').addEventListener('click', async () => {
  try {
    await chrome.downloads.removeFile(lastDownloadId);
    await chrome.downloads.erase({ id: lastDownloadId });
    $('exp-delete').hidden = true;
    $('exp-report').append(el('p', { class: 'muted' }, 'Fichier supprimé.'));
  } catch {
    $('exp-report').append(el('p', { class: 'muted' }, 'Suppression automatique impossible : supprimez le fichier .stx à la main ou avec scripts\\cleanup.ps1.'));
  }
});

// ---------------------------------------------------------------- IMPORT

let impCookies = null;
let impPicker = null;
let lastPlan = null;

function importOptions() {
  return { domains: impPicker.getSelected(), includeSession: $('imp-session').checked, overwrite: $('imp-overwrite').checked };
}

async function existingKeys() {
  const all = await chrome.cookies.getAll({});
  return new Set(all.map((c) => core.cookieKey(c)));
}

$('imp-decrypt').addEventListener('click', async () => {
  const file = $('imp-file').files[0];
  $('imp-meta').textContent = '';
  try {
    if (!file) throw new Error('Choisissez d\'abord le fichier .stx.');
    if (file.size > 100 * 1024 * 1024) throw new Error('Fichier trop volumineux.');
    const envelope = parseEnvelopeText(await file.text());
    const payload = await decryptJson(envelope, $('imp-pass').value);
    const v = core.validatePayload(payload);
    impCookies = v.cookies;
    $('imp-pass').value = '';
    $('imp-meta').textContent = `Fichier déchiffré en mémoire : ${v.cookies.length} cookie(s) valides${v.invalid ? `, ${v.invalid} ignoré(s) car invalides` : ''}${v.createdAt ? `, créé le ${v.createdAt}` : ''}${v.source ? ` depuis ${v.source}` : ''}.`;
    impPicker = createPicker($('imp-domains'), core.domainStats(impCookies));
    impPicker.onChange = () => { $('imp-run').disabled = true; lastPlan = null; };
    $('imp-step2').hidden = false;
  } catch (e) {
    $('imp-meta').textContent = e && e.message ? e.message : 'Erreur inconnue.';
  }
});

$('imp-analyze').addEventListener('click', async () => {
  try {
    const opts = importOptions();
    if (opts.domains.size === 0) throw new Error('Sélectionnez au moins un domaine.');
    lastPlan = core.planImport(impCookies, await existingKeys(), opts, Date.now() / 1000);
    renderReport($('imp-preview'), 'Simulation (rien n\'a été écrit)', [['Cookies qui seraient importés', lastPlan.items.length], ...skippedRows(lastPlan.skipped)]);
    $('imp-run').disabled = !($('imp-profile').checked && lastPlan.items.length > 0);
  } catch (e) {
    renderReport($('imp-preview'), 'Simulation impossible', [], [{ title: 'Raison', items: [e && e.message ? e.message : 'erreur inconnue'] }]);
  }
});
$('imp-profile').addEventListener('input', () => { $('imp-run').disabled = !($('imp-profile').checked && lastPlan && lastPlan.items.length > 0); });

$('imp-run').addEventListener('click', async () => {
  $('imp-run').disabled = true;
  try {
    // Re-planifie au moment de l'écriture pour tenir compte de l'état réel du profil.
    const opts = importOptions();
    const plan = core.planImport(impCookies, await existingKeys(), opts, Date.now() / 1000);
    const result = await core.runImport(plan.items, (d) => chrome.cookies.set(d), (i, n) => { $('imp-progress').textContent = `Import en cours : ${i} / ${n}`; });
    const after = await existingKeys();
    const verified = plan.items.filter((it) => after.has(it.key)).length;
    const relogin = core.reloginDomains([...opts.domains], result.perDomain);
    renderReport($('imp-report'), 'Import terminé', [
      ['Cookies acceptés par le navigateur', result.imported],
      ['Cookies retrouvés après vérification', verified],
      ['Échecs', result.failed],
      ...skippedRows(plan.skipped),
    ], [
      { title: 'Reconnexion probable pour ces domaines', items: relogin.map((r) => `${r.domain} : ${r.reason}`) },
      { title: 'À savoir', items: core.GENERAL_NOTES },
      { title: 'Étape suivante', items: ['Ouvrez vos sites dans Brave pour vérifier les sessions.', 'Puis supprimez le fichier .stx (scripts\\cleanup.ps1) et désinstallez l\'extension des deux navigateurs.'] },
    ]);
    $('imp-progress').textContent = '';
    $('imp-finish').hidden = false;
  } catch (e) {
    renderReport($('imp-report'), 'Import échoué', [], [{ title: 'Raison', items: [e && e.message ? e.message : 'erreur inconnue'] }]);
  }
});

$('imp-finish').addEventListener('click', () => {
  impCookies = null; impPicker = null; lastPlan = null;
  location.reload();
});

// ---------------------------------------------------------------- Démarrage

showTab('export');
