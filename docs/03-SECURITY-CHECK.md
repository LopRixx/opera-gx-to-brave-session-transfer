# Security verification procedure before use

Do not take my word for it: this code handles access to your accounts. Here is how to verify it yourself, from quickest to most thorough.

## A. Automatic check (2 minutes)

```
powershell -ExecutionPolicy Bypass -File .\scripts\audit.ps1
```

The script is read-only (it connects to nothing and modifies nothing). `-ExecutionPolicy Bypass` only applies to that process and changes no Windows setting. Read the script before running it; it is short. Its messages are in French.

It checks:

- the file types present (only `.js`, `.html`, `.css`, `.json`: no executable, no WebAssembly);
- the manifest permissions: only `cookies` and `downloads`, access to all sites (`<all_urls>`, needed to read cookies of any site), **no** content script, no `externally_connectable`, no resource exposed to websites;
- a security policy (CSP) with `connect-src 'none'`: the extension's pages cannot open any network connection;
- the absence in the code of `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`, `importScripts`, `eval(`, `new Function`, `innerHTML` and of any `http(s)://` URL;
- the SHA-256 hashes from `SHA256SUMS.txt` (proves the files are the ones delivered; does not replace reading the code).

**A failure means: do not install**, and look at the line it flags.

*The script was written without being run in the environment where it was authored (no PowerShell there). The same pattern search was done with `grep` on the delivered code and found nothing. If the script itself crashes, that is a defect of the script, not necessarily of the code.*

## B. Targeted code review (10 minutes)

The useful code fits in four short files.

| File | What to check |
|---|---|
| `extension/manifest.json` | The permissions above, nothing else. |
| `extension/background.js` | 3 lines: opens the tool's tab. |
| `extension/lib/crypto.js` | PBKDF2-SHA256 (600,000 iterations) to AES-256-GCM through `crypto.subtle` (native to the browser, no library). The passphrase is never stored. |
| `extension/app.js` | Search for `chrome.cookies.`: only `getAll`, `set`, `getAllCookieStores`. **No `remove`**: the tool deletes no cookie. |

## C. Risk-free test

1. First install the extension in Brave only and open the Import tab: the checks should display without error.
2. Do a first run with **a single low-sensitivity domain** (a forum where you have a throwaway account, for example). Check in Brave that the session passes **before** exporting the important domains.
3. During the transfer you can cut the network (airplane mode / unplugged cable): the tool must work the same way.

## D. After use

- Delete the `.stx` file (`scripts\cleanup.ps1`), uninstall the extension from both browsers.
- If you suspect the file or the passphrase leaked: **revoke the sessions** on each service ("sign out of all devices" in the account settings) and change the passwords. Note that this also logs Brave out; that is the price of safety.

## What this procedure does not cover

- A flaw in Chromium, Opera GX or Brave themselves.
- Other malware already present on your PC (it could read the file or capture the passphrase as you type it).
- The strength of a weak passphrase: the encryption is solid, but 12 guessable characters will not protect you. Prefer the **"Générer"** (Generate) button.
