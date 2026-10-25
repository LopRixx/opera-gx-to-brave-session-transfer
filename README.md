# Session Transfer: Opera GX to Brave (Windows)

A temporary, 100% local Chromium extension that exports your session cookies from Opera GX into a file encrypted with your passphrase, then imports them into Brave. It only uses the official `chrome.cookies` extension API: it does not read browser profiles from disk and does not bypass any encryption.

**Honest status**: the logic and the encryption are covered by unit tests (21 passing). It has been used successfully by its author for Opera GX to Brave on Windows, but **results per website are not guaranteed** (see [docs/04-LIMITATIONS.md](docs/04-LIMITATIONS.md)). Provided as is, with no warranty.

> **Warning**: a cookie file can give access to your accounts without a password or two-factor prompt. Never share or commit an exported `.stx` file, and delete it after use.

> The user interface and the PowerShell scripts' messages are currently in French.

## Project tree

```
session-transfer/
├── README.md
├── LICENSE                         MIT
├── .gitignore                      Blocks *.stx exports and other secrets
├── SHA256SUMS.txt                  Hashes of the extension files
├── package.json                    Tests only (no dependencies)
├── extension/                      <- the folder to load in the browsers
│   ├── manifest.json               MV3; permissions: cookies, downloads; CSP with no network
│   ├── background.js               Opens the tool's tab
│   ├── app.html / app.css / app.js UI: checks, export, import, reports
│   └── lib/
│       ├── crypto.js               PBKDF2-SHA256 -> AES-256-GCM (WebCrypto)
│       └── cookies-core.js         Selection, validation, import plan, reports (pure, testable)
├── tests/
│   ├── crypto.test.mjs
│   └── cookies-core.test.mjs
├── scripts/
│   ├── audit.ps1                   Pre-install check (read-only)
│   └── cleanup.ps1                 Deletes the .stx file after use
└── docs/
    ├── 01-FEASIBILITY.md
    ├── 02-INSTALLATION.md
    ├── 03-SECURITY-CHECK.md
    └── 04-LIMITATIONS.md
```

## Reading order

1. [01-FEASIBILITY.md](docs/01-FEASIBILITY.md): what is possible, what is not, and why this approach.
2. [03-SECURITY-CHECK.md](docs/03-SECURITY-CHECK.md): do this before installing.
3. [02-INSTALLATION.md](docs/02-INSTALLATION.md): Windows step by step.

## Run the tests (optional, requires Node 20+)

```
node --test tests/crypto.test.mjs tests/cookies-core.test.mjs
```

## Design guarantees

- No network requests: no `fetch`, the CSP forbids `connect-src`, no content scripts.
- No reading of passwords, history, or profiles on disk.
- Only `getAll`, `set` and `getAllCookieStores` are called: **no cookie is ever deleted**.
- Cookies already present in the target browser are kept by default.
- No cookie value is ever displayed or logged.
- Intermediate file: AES-256-GCM, key derived from YOUR passphrase (PBKDF2, 600,000 iterations), authenticated header.

## License

MIT, see [LICENSE](LICENSE).
