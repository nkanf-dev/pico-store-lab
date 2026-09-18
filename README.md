![PICO Store Lab banner](assets/brand/banner.svg)

# PICO Store Lab

[![CI](https://github.com/nkanf-dev/pico-store-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/nkanf-dev/pico-store-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-b13a22.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/nkanf-dev/pico-store-lab?include_prereleases&color=b13a22)](https://github.com/nkanf-dev/pico-store-lab/releases)

[简体中文](README.zh-CN.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Releasing](RELEASING.md)

An independent PICO app catalog and on-device installer, with reusable SDKs for developers. Browse recommended apps or search the wider PICO catalog, inspect releases, and get an app through your own PICO account. PICO Store Lab is an independent community project.

Explore at **[pico.kanglives.top](https://pico.kanglives.top)**. The public website offers discovery, release metadata, and an in-browser APK downloader; the headset client handles on-device download and install.

<a id="player-guide"></a>
## Player guide: download with your own account

You need a PICO account that can obtain your chosen app from the official regional Store. Search or browse on the website, then sign in with your own account to download. Four routes are supported: the on-device client, two local CLIs, and the website's own in-browser downloader.

### Option A — do everything on the headset

1. Download `pico-store-android.apk` from the [latest GitHub Release](https://github.com/nkanf-dev/pico-store-lab/releases/latest). With USB debugging enabled and the headset connected to a computer:

   ```sh
   adb devices                         # accept the USB debugging prompt in the headset
   adb install -r pico-store-android.apk
   ```

   If your PICO system offers an APK installer, you may open the downloaded file there instead. That route has not yet been tested on our headset. The debug APK is experimental and may not update a copy signed by a different key.
2. In the headset's app library, open **PICO Store Lab** under *Unknown Sources* or the equivalent non-Store app area (the label varies by PICO OS version). Browse recommendations or search for an app, select it, and review the official version. You can save favorites for later.
3. Enter your PICO account email, tap **Send code**, enter the alphanumeric code sent to that mailbox, and tap **Sign in**. The headset client keeps the session on the device; the website's downloader keeps it on the server instead. Neither ever stores your password.
4. Open an app and tap **Get** for a free offer or **Download** if it is already in your account. The client confirms account ownership, claims an available free offer when needed, and downloads to `Downloads/PICO Store Lab` after the entitlement appears. It checks the APK's MD5, package name, and version before opening Android's installer. If Android asks to allow installs from this source, allow **PICO Store Lab** and retry. Confirm the Android installation prompt.
5. For an unowned paid app, **View in PICO Store** opens its official product page. Complete a purchase there, return to PICO Store Lab, and tap **Download** once account ownership is confirmed.

If an item has no offer for your account region, check its official listing and account region. The client cannot change account region. The Android client has been tested on a PICO headset by the project owner; each new fix still needs a fresh device check.

### Option B — download on macOS with the Rust Desktop CLI

Download `pico-store-desktop-macos-arm64` from the [same Release](https://github.com/nkanf-dev/pico-store-lab/releases/latest). Search by app name, then copy the exact `itemId` and `packageName` from the result into `status` and `download`. The following example uses YouTube VR; replace the app fields and email for your own choice. `login` prompts for the emailed code without echoing it.

```sh
chmod +x ./pico-store-desktop-macos-arm64
./pico-store-desktop-macos-arm64 search 'YouTube VR'
./pico-store-desktop-macos-arm64 status --item-id 7270207384512020485 --package com.google.android.apps.youtube.vr.pico
./pico-store-desktop-macos-arm64 send-code --email you@example.com
./pico-store-desktop-macos-arm64 login --email you@example.com --auth-file ./pico-auth.json
./pico-store-desktop-macos-arm64 download --item-id 7270207384512020485 --package com.google.android.apps.youtube.vr.pico --auth-file ./pico-auth.json --output ./selected-app.apk
adb install -r ./selected-app.apk          # optional: headset connected and USB debugging allowed
```

The output path must be a new `.apk` file. The CLI checks the official MD5 before placing the verified file there. Keep `pico-auth.json` private and do not upload it, the APK, or signed CDN links to an issue. If macOS blocks the unsigned CLI, build it from source with `cargo run -p pico-store-desktop -- ...` after reviewing the repository.

### Option C — Python CLI

With Python 3.11+, install the Python package from this repository in a virtual environment. Use `search` to find exact item fields, then follow the same account flow. Choose a fresh `.apk` output path with enough free disk space.

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install 'git+https://github.com/nkanf-dev/pico-store-lab.git#subdirectory=packages/python'
pico-store-py search 'YouTube VR'
pico-store-py status --item-id 7270207384512020485 --package com.google.android.apps.youtube.vr.pico
pico-store-py send-code --email you@example.com
pico-store-py login --email you@example.com --auth-file ./pico-auth.json
pico-store-py download --item-id 7270207384512020485 --package com.google.android.apps.youtube.vr.pico --auth-file ./pico-auth.json --output ./selected-app.apk
```

The desktop CLIs download to your computer; use ADB or another headset-supported installer to install the verified APK. The Android client instead handles the download and system-confirmed install on the headset.

### Option D — Download APK in the browser

On [pico.kanglives.top](https://pico.kanglives.top), open **04 / WEB DOWNLOAD**, sign in with your PICO email code, and use **Download APK**. This is the shortest route when you just want a file on a computer:

1. Enter your account email, choose **Send code**, then type the letters and digits from that mailbox's code and choose **Sign in**.
2. If an available free app is not yet in your account, choose **Get app and prepare download** to claim it. Browsing an app does not claim it. Once owned, the panel shows its APK version, size, and MD5. Choose **Copy MD5** if you want to check the file with another tool.
3. Choose **Download APK**. Your browser downloads it with the filename we send, and the panel tells you to keep the page open until it finishes.
4. To confirm the file arrived intact, select it under **Verify a downloaded file**. It is hashed in 4 MiB slices, so a large APK never has to fit in memory, and the result is compared with PICO's own MD5.

The downloader works with apps your PICO account owns, including paid apps. Unowned paid apps and unavailable offers must be obtained through the official Store first. Free acquisition uses an explicit same-origin `POST /api/download/acquire`; the download and metadata GET routes never acquire apps. Use **PICO CDN link** for the direct upstream URL, or let the Worker stream the file with the MD5 headers attached. Either way there is no APK storage bucket. If signing out fails, the page warns that the session may still be active and lets you retry.

## What is here

| Component | Language | Role | Verified in this release |
| --- | --- | --- | --- |
| `packages/ts` | TypeScript | Store requests, exact-ID response parsing, mirror/release policy | Strict build and contract tests |
| `packages/python` | Python | Typed protocol and mirror policy, small CLI | Ruff PEP checks, tests, wheel/sdist |
| `packages/rust` | Rust | Typed protocol and mirror policy | fmt, Clippy, tests |
| `packages/kotlin` | Kotlin | Android-compatible protocol and mirror policy | JVM unit tests and AAR build |
| `apps/website` | TypeScript SDK + Cloudflare Worker | Bilingual public release page, monotonic version tracker, and in-browser APK downloader | Local/fixture tests; deployed to Cloudflare |
| `apps/desktop-rs` | Rust SDK | Desktop CLI for account login and verified downloads | Compiles and tests; no GUI yet |
| `apps/android` | Kotlin SDK | PICO on-device status, sign-in and system-confirmed install | Owner-tested on headset; latest fixes build-tested |

The four SDKs use a shared [contract fixture](contracts/v1/fixtures.json). Each exposes public search, item lookup, email sign-in, authenticated download metadata, and verified APK acquisition. Low-level request builders and validators remain available for custom transports. The CLI is a subset of the SDK, not the other way around. Item IDs larger than JavaScript's safe integer range are preserved exactly. Release tracking keeps the highest known version, deduplicates history, and retains the last good snapshot after a failed check.

## Get started

The project is a single monorepo. Use only the language you need:

```sh
# TypeScript SDK and Website tests — Node.js 25+
npm ci
npm test
node apps/website/src/dev.js                 # http://127.0.0.1:8787

# Python SDK — Python 3.11+
PYTHONPATH=packages/python/src python3 -m unittest discover -s packages/python/tests
PYTHONPATH=packages/python/src python3 -m pico_store_lab --help

# Rust SDK and Desktop CLI — Rust 1.85+
cargo test --workspace
cargo run -p pico-store-desktop -- --help

# Kotlin SDK and PICO Android client — Java 17, Android SDK 37
cd apps/android
./gradlew testDebugUnitTest assembleDebug
```

The Android debug APK is at `apps/android/app/build/outputs/apk/debug/app-debug.apk`. It requests Android's normal installation confirmation; it does not silently install. Headset runtime verification remains open until a device is connected.

### Developer SDK snippets

Each SDK can run the full acquisition flow directly. Supply the verification code through your own UI, then select an exact item ID and package from search results. The examples use a representative search term; any discoverable app can be selected.

Each SDK exposes a request profile for device identity, language, time zone, store endpoints and web-store region. See its package README for parameters and defaults. High-level downloads check account ownership and acquire available free offers before requesting APK metadata.

```ts
import { PicoStoreClient } from '@nkanf-dev/pico-store-sdk/client';
const client = new PicoStoreClient();
const target = (await client.search('YouTube VR')).items[0];
await client.item(target);
await client.sendCode(email);
const auth = await client.login(email, codeFromUser);
await client.download(target, auth, './selected-app.apk');
```

```python
from pathlib import Path
from pico_store_lab import PicoStoreClient, StoreTarget
client = PicoStoreClient()
found = client.search("YouTube VR").items[0]
target = StoreTarget(found.item_id, found.package_name)
client.item(target)
client.send_code(email)
auth = client.login(email, code_from_user)
client.download(target, auth, Path("selected-app.apk"))
```

```rust
use pico_store_lab::{PicoStoreClient, StoreTarget};
let client = PicoStoreClient::default();
let found = client.search("YouTube VR", 1)?.items.remove(0);
let target = StoreTarget::new(&found.item_id, &found.package_name, "")?;
client.item(&target)?;
client.send_code(&email)?;
let auth = client.login(&email, &code_from_user)?;
client.download(&target, &auth, std::path::Path::new("selected-app.apk"))?;
```

```kotlin
val client = PicoStoreClient()
val found = client.search("YouTube VR").first()
val target = StoreTarget(found.itemId, found.packageName)
client.item(target)
client.sendCode(email)
val auth = client.login(email, codeFromUser)
client.download(target, auth, File("selected-app.apk"))
```

The GitHub Release lists current SDK registry availability. Maven Central publication remains a separate step.

## Accounts, APKs and mirroring

The Rust and Python CLIs support public status, email-code sign-in, and an explicit verified download path. Use `--help` for exact options. Never share an auth file. The default mirror policy selects free APKs below 512 MiB when a host application enables mirroring. The Cloudflare page checks public metadata daily; its downloader streams or redirects to PICO's own APK on request without hosting it, and keeps each signed-in visitor's PICO credentials encrypted in D1 behind an HttpOnly cookie. The account flow needs a `SESSION_SECRET` of at least 32 characters (`npx wrangler secret put SESSION_SECRET`, or `wrangler secret put` for the deployed environment); sign-in and download return `503` without it. Still no R2 bucket: nothing is stored but the session row and the release history. This repository's MIT license covers **our code only**; it does not grant redistribution rights to third-party APKs.

Please report security issues privately as described in [SECURITY.md](SECURITY.md). For development and release standards, see [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md).
