# Server password KDF source

`password-kdf.gs` is a readable, self-contained IIFE generated from the pinned
`@noble/hashes` **2.4.0** release. `Code.gs` embeds the identical code between
`BEGIN GENERATED PASSWORD KDF` and `END GENERATED PASSWORD KDF`, so the existing
single-file Apps Script paste/deployment procedure remains sufficient. No npm
package, network loader, external service, or browser cryptography is used at
runtime. This directory is not included in the frontend application bundle.

The immutable `upstream/*.js` modules and `LICENSE` come from the npm release
tarball listed in `PROVENANCE.json`. Its SHA-512 integrity was verified before
extracting these files. The provenance records SHA-256 hashes of every retained
upstream file and of the generated bundle. The package has no runtime
dependencies. Keep the complete MIT license with the generated copy.

The generator applies three compatibility changes before bundling:

- `kdfInputToBytes` accepts byte arrays only, so unused UTF-8/TextEncoder code is
  removed. Password UTF-8 handling still uses the original Apps Script Utilities
  HMAC prehash. The stored ASCII salt is copied byte for byte.
- `Object.hasOwn` uses `Object.prototype.hasOwnProperty.call`, with identical
  own-property checks on the older JavaScript runtime.
- TypeScript lowers class fields to `Object.defineProperty` assignments in
  constructors. No extra compiler runtime library is introduced.

The SHA-256, HMAC and PBKDF2 algorithms are unchanged. The adapter fixes the
derived-key length at 32 bytes and receives the existing stored iteration count.
The `pbkdf2p1` format, `kdf-v2|` pepper prehash, salts, auth versions, rate limits,
credential validation, upgrades, and server-only execution remain unchanged.
Each KDF uses one Utilities HMAC call for the pepper prehash; its full PBKDF2
work runs synchronously in JavaScript. No derived-key cache is used.

From the repository root, with the existing lockfile dependencies installed:

```sh
node scripts/generate-password-kdf.mjs --check
node scripts/generate-password-kdf.mjs
node --experimental-strip-types --test tests/apps-script.test.mjs
```

`--check` is read-only and verifies reproducibility, source hashes, the bundle
hash, and the inline copy. Normal generation refuses an unexpected bundle hash.
After intentionally reviewing a source/build change, explicitly acknowledge
the new generated hash with:

```sh
node scripts/generate-password-kdf.mjs --update-hash
```

Run the owner-only `benchmarkNodePasswordHash` in the Apps Script editor to
measure both 500 rounds and the actual current iteration count. Its result and
logs contain timings/counts only. Local Node timings do not establish Apps
Script performance. Do not lower the iteration count as a performance shortcut.

Upstream independent auditing covered version 1.0.0 in 2022. It does not certify
the entire 2.4.0 release or these deployment adapters. Preserve the pinned source
and review future upstream security updates explicitly.
