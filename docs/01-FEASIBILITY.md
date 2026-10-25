# Feasibility analysis: transferring sessions from Opera GX to Brave (Windows)

Written on 25 October 2026. Points marked **[verified]** rely on official documentation consulted for this project; **[unverified]** means it could not be confirmed in a real browser by the author of the code at the time of writing.

## 1. Why not copy the cookie file

Chromium browsers (so Opera GX and Brave) store cookies in a SQLite database inside the profile. The values are encrypted with a key tied to the Windows user session (DPAPI). Since Chrome 127, Google added "App-Bound Encryption" on Windows, which ties the encryption to the identity of the browser and to the machine, precisely to stop other applications from opening this data **[verified: Google Security Blog, 30 July 2024, about Chrome; whether Opera GX or Brave apply it identically was not established]**.

Consequences:

- Copying one browser's database into another does not work: each browser has its own key.
- Decrypting this data from outside the browser means bypassing a browser protection. This project forbids it, and it is also the technique used by cookie-stealing malware. **Ruled out.**

## 2. The chosen approach: the official `chrome.cookies` API

A Chromium extension can read and write cookies through the `chrome.cookies` API, with the `cookies` permission plus host permissions for the sites involved **[verified: developer.chrome.com/docs/extensions/reference/api/cookies]**. The browser decrypts the data itself for the extension, so no protection is bypassed, and each browser re-writes the cookies with its own key.

What the documentation establishes:

- `getAll()` only returns unexpired cookies, and only for domains covered by the host permissions **[verified]**.
- `set()` can overwrite an equivalent existing cookie **[verified]** (this tool avoids it by default).
- The `secure`, `httpOnly`, `sameSite`, `expirationDate`, `domain` and `path` fields exist for both reading and writing **[verified for most; `httpOnly` is part of the Cookie type of the API]**.
- Partitioned-cookie support (`partitionKey`) exists since Chrome 119 for targeted reads and writes, but `set()` writes to the unpartitioned jar by default **[verified, though the wording of the documentation has varied between versions; the tool therefore does not try to transfer them]**.

## 3. Is a temporary extension viable?

Yes: Opera GX and Brave are Chromium browsers and expose the Chromium extension APIs. Extensions load in developer mode ("unpacked extension"). The tool was designed from the documented APIs and unit-tested outside a browser (21 tests); its author then ran it successfully on Opera GX to Brave. Browser-specific points:

- Opera GX is a Chromium fork whose version can lag behind Chrome. The tool requires Chromium 119 or later (`minimum_chrome_version`) and displays the detected version in its checks.
- Brave loads unpacked extensions from `brave://extensions` (developer mode). Its "Shields" filter cookies set by web pages; whether they affect writes made through an extension API was not verified **[unverified]**.

The **same extension** is installed in both browsers; only the operation used differs.

## 4. Real limitations

| Case | Effect |
|---|---|
| **HttpOnly**, **Secure**, **SameSite** cookies | The API reads and writes them: transferable. A `SameSite=None` cookie without `Secure` is rejected by Chromium; the tool detects it and counts it as "invalid". |
| `__Host-` / `__Secure-` prefixes | Strict rules (Secure, no domain, path `/`). Cookies that do not satisfy them are counted as invalid. |
| **Session** cookies (no expiry) | Readable, but they disappear when Brave closes unless Brave restores the session. Excluded by default, opt-in. |
| **Expired** cookies | Not exposed by the API; ignored at import if they expire in the meantime. |
| **Partitioned** cookies | Not transferred: if the API returns them the tool spots and reports them; otherwise they are invisible to it. They mostly concern embedded widgets, rarely the main login. |
| **Profiles** | An extension only acts on the profile of the browser where it is installed. The API does not expose the profile name, so the tool asks for an explicit confirmation. |
| **Private windows** | Disallowed for the extension. |
| Sessions tied to something other than cookies | **Not transferable with this method**: `localStorage`/`IndexedDB` (the likely case of Discord Web), device or IP binding, rotating tokens. |
| Session rotation | Some sites renew the token on each use: using both browsers in parallel may log one of them out. |

## 5. What is not promised

- That YouTube, Twitch or Discord stay logged in. Twitch and YouTube rely largely on cookies, so success is plausible, but it depends on each site; Google may also ask for re-verification on a new device. Discord Web: re-login is very likely.
- That the extension loads without adjustment in every Opera GX version (see the manifest CSP if the browser rejects it).

## 6. Why not an executable or an external script

It would have to read the profiles directly, therefore break the protection described in section 1, or add a program with access to the whole profile. None of this is needed with the extension API.

## Conclusion

A **partial but honest** transfer is feasible with the official API: everything stored in standard cookies (including HttpOnly) can pass; the rest requires logging in again. The tool reports precisely what was written and verified, without displaying any value.

Sources: developer.chrome.com/docs/extensions/reference/api/cookies; security.googleblog.com, "Improving the security of Chrome cookies on Windows" (July 2024).
