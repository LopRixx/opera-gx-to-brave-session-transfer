# Known limitations

## What was NOT verified

- **Automated tests only cover the logic.** What is unit-tested (21 Node tests, all passing): encryption, detection of a tampered file, and all the cookie sorting/validation/planning logic. Also checked: the syntax of every JavaScript file, the manifest validity, and the absence of network APIs in the code.
- **Real-browser behaviour** (interface rendering, manifest loading, `chrome.downloads`, the effect of `chrome.cookies.set` on your cookies) was not covered by automated tests. The author of the project used it successfully for Opera GX to Brave on Windows, and stayed logged in on their favourite sites afterwards. This does not prove it works for every site, browser version or machine.
- The PowerShell scripts (`audit.ps1`, `cleanup.ps1`) were not run by the code's author at the time of writing.

Try a low-sensitivity domain first (see the security check, section C).

## Technical limitations

1. **Only cookies are transferred.** Sessions stored in `localStorage`, `IndexedDB` or session storage are not. Discord Web normally keeps its token in local storage: expect to log in again (the QR code login from the mobile app is quick). Transferring that storage would require injecting code into pages; this was deliberately not done, as it widens the risk surface considerably.
2. **Partitioned cookies**: not transferred.
3. **Session cookies** (no expiry): excluded by default; even when imported, they disappear when Brave closes unless the session is restored.
4. **Expired cookies**: the API does not expose them.
5. **A single cookie store** (that of the window's profile); no private browsing.
6. **One profile at a time**: the API does not give the profile name; the tool asks you to confirm.
7. **Sessions bound to the device, the IP or a fingerprint**: the server may refuse the imported cookie. Google, in particular, may ask for extra verification.
8. **Token rotation**: if a site renews the cookie on each use, the old or the new browser may be logged out.
9. **Cookies rejected by browser rules** (`__Host-`, `__Secure-`, `SameSite=None` without `Secure`, etc.): counted as "invalid" in the report.
10. **Domains are grouped by exact host name** (`www.example.com` and `example.com` are two lines): no public suffix list is embedded, so as not to invent anything. The preset buttons (Google/YouTube, Twitch, Discord) rely on simple patterns and may miss an ancillary domain.
11. **Post-import verification** means the cookie is present in the target browser. It does not prove the server will accept the session.

## Security limitations

- The passphrase and the decrypted cookies live in JavaScript memory during the operation; JavaScript cannot wipe memory with certainty. The tool clears the fields and drops the references, then reloads the page at the end.
- The `.stx` file is only "temporary" if you delete it. On an SSD, the overwrite done by `cleanup.ps1` gives no guarantee of physical erasure; protection rests on the encryption.
- Cookie domain names appear in the interface (needed to choose), never the values. The domains are stored in the encrypted file, not in clear text.
- The extension asks for access to all sites (needed to read cookies of any domain). Uninstall it after use.
- Key derivation uses PBKDF2 (natively available in the browser) rather than Argon2; with 600,000 iterations and a generated passphrase the protection level fits the use, but a short or predictable passphrase remains the weak link.
