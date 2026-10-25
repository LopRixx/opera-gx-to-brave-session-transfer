# Installation and usage guide (Windows)

Prerequisites: Opera GX and Brave installed, and **the websites concerned open and logged in inside Opera GX**. No extra tool to install.

> The tool's interface is in French. Button labels are quoted below in French, followed by an English gloss in parentheses. Menu names in your browser may differ slightly depending on its version.

## 0. Preparation

1. Unzip the project into a simple folder, **outside any synced folder** (not OneDrive), for example `C:\Tools\session-transfer`.
2. First do the security check: [03-SECURITY-CHECK.md](03-SECURITY-CHECK.md) (about 5 minutes).
3. Close sensitive tabs you do not need.

## 1. Install in Opera GX and export

1. In Opera GX, open `opera://extensions`.
2. Turn on **Developer mode** (toggle at the top right).
3. Click **Load unpacked** and pick the `extension` folder (the one containing `manifest.json`).
4. On the extension's card, check that **"Allow in private" is turned off** and that site access is granted ("on all sites").
5. Click the extension's icon in the toolbar (pin it from the extensions menu if needed): the tool opens in a tab.
6. In the **"1. Exporter"** tab:
   1. Read the checks; all lines should be `[OK]`.
   2. Tick the profile confirmation.
   3. Click **"Analyser les cookies"** (Analyze cookies), then choose domains: the buttons `+ Google / YouTube`, `+ Twitch`, `+ Discord`, or tick domains by hand. Avoid "Tout sélectionner" (Select all) without a reason: it also takes advertising trackers.
   4. Enter a passphrase of at least 12 characters (or click **"Générer"** (Generate) and write it down on paper or in a password manager, **not** in a file next to the export).
   5. Tick the warning checkbox, click **"Exporter et enregistrer le fichier chiffré"** (Export and save the encrypted file), and save the `.stx` file in a local folder (no cloud).
7. The report shows the number of cookies exported and skipped (never their values).

## 2. Install in Brave and import

1. In Brave, open `brave://extensions`, turn on **Developer mode**, **Load unpacked**, same `extension` folder.
2. Same checks: private mode disabled, site access granted.
3. Open the tool, **"2. Importer"** tab:
   1. Checks `[OK]`, then the Brave profile confirmation.
   2. Choose the `.stx` file, enter the passphrase, click **"Déchiffrer"** (Decrypt). The content stays in memory; nothing is written to disk.
   3. Select the domains to import.
   4. **"Simuler l'import"** (Simulate the import) shows what would be written and what would be skipped (already present, expired, invalid...).
   5. **"Importer dans Brave"** (Import into Brave). By default, cookies already present in Brave are **kept** and nothing is deleted.
4. Read the report: cookies accepted, found again after verification, failures, and the list of domains where logging in again is still likely.
5. Open YouTube, Twitch, Discord Web in Brave to see the real result.

## 3. Cleanup (important)

1. Click **"Terminer et effacer les données de la mémoire"** (Finish and clear data from memory).
2. Delete the `.stx` file: `powershell -ExecutionPolicy Bypass -File .\scripts\cleanup.ps1` (asks for confirmation before each deletion), then empty the Recycle Bin if you deleted it by hand.
3. Remove the extension from **both** browsers (extensions page, **Remove**).
4. If a site randomly logs you out in the following days (token rotation), just log in again in Brave and stop using Opera GX for that account.
5. Do **not log out** of a site in Opera GX: logging out invalidates the session on the server, so also the one in Brave. To erase Opera GX's traces, clear the site data locally or uninstall Opera GX (uninstalling does not contact any site).

## Troubleshooting

| Symptom | Lead |
|---|---|
| The browser refuses to load the extension (manifest / CSP error) | Note the exact message; the `content_security_policy` line of `manifest.json` is the first suspect. |
| "Accès aux sites non accordé" (site access not granted) | Extensions page, extension details, site access: "on all sites". |
| "Phrase de passe incorrecte ou fichier altéré" (wrong passphrase or altered file) | Wrong passphrase, or the file was modified/truncated. Nothing lets the tool tell the two apart. |
| A site still asks you to log in | See [04-LIMITATIONS.md](04-LIMITATIONS.md). Expected for some sites. |
