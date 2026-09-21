# UI Root Cause Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Android image re-downloads, add settings pages, render desktop media, and make desktop details scroll reliably with regression coverage.

**Architecture:** Keep media URL parsing generic across the Rust, Kotlin, TypeScript, and web clients; put Android memory/disk bytes caching, request coalescing, bounded network reads, and bitmap decoding behind an app-scoped loader. Extend client item models with parseable cover and screenshot URLs, use GPUI's cached image element on desktop, and give the detail column its own bounded scroll region. Keep settings limited to existing technical preferences, especially theme selection.

**Tech Stack:** Kotlin/Compose, Android `HttpURLConnection` and file cache, Rust/Serde, GPUI 0.6.4, Cargo tests, Gradle tests/build.

---

### Task 1: Extend the Rust item model with validated media

**Files:**
- Modify: `packages/rust/src/lib.rs:116-133` and `packages/rust/src/lib.rs:442-485`
- Test: `packages/rust/src/lib.rs:647-699`

- [x] Add optional `cover_url` and `screenshots` fields to `PublicItem`.
- [x] Parse only supported `http`/`https` URLs with a host; leave domain, port, and credential policy to the source/network layer.
- [x] Parse landscape/square cover fallbacks and preserve all supported screenshots.
- [x] Add tests proving media extraction while ignoring unsupported URL schemes.
- [x] Run `cargo test -p pico-store-lab`.

### Task 2: Make Android image loading app-scoped and cached

**Files:**
- Create: `apps/android/app/src/main/java/dev/nkanf/picostore/StoreImageLoader.kt`
- Modify: `apps/android/app/src/main/java/dev/nkanf/picostore/StoreScreen.kt:1-439`
- Modify: `apps/android/app/src/main/java/dev/nkanf/picostore/MainActivity.kt:17-78,220-260`
- Test: `apps/android/app/src/test/java/dev/nkanf/picostore/StoreImageCacheTest.kt`

- [x] Add URL parsing, stable SHA-256 keys, bounded memory/disk bytes cache, atomic disk writes, in-flight request coalescing, finite timeouts, response limits, and no persistence on failure.
- [x] Inject one loader into `StoreScreen`; make `StoreImage` observe it instead of opening a URL connection itself.
- [x] Close the loader with the activity lifecycle.
- [x] Test repeated loads, concurrent same-key loads, disk reuse, invalid URLs, and failed fetches not being cached.
- [x] Run the focused Android unit tests and debug build.

### Task 3: Add a real Android settings page

**Files:**
- Modify: `apps/android/app/src/main/java/dev/nkanf/picostore/StoreScreen.kt`
- Modify: `apps/android/app/src/main/java/dev/nkanf/picostore/MainActivity.kt`
- Modify: `apps/android/app/src/main/res/values/strings.xml`
- Modify: `apps/android/app/src/main/res/values-zh-rCN/strings.xml`

- [x] Add a settings navigation state and screen with explicit System/Light/Dark theme choices.
- [x] Keep theme persistence in `SharedPreferences` and preserve back behavior.
- [x] Add localized labels and semantics for the settings entry.
- [x] Run Android compilation to catch Compose/API regressions.

### Task 4: Render desktop media and fix detail scrolling/settings

**Files:**
- Modify: `apps/desktop-rs/src/main.rs:1-760`

- [x] Render validated icon/cover/screenshot URLs with GPUI `img` and fallback placeholders.
- [x] Add a desktop settings view for the existing language preference and a settings entry.
- [x] Put the detail column in a bounded vertical scroll region and add `min_h_0` at the flex boundaries.
- [x] Keep the account panel independent from the detail scroll area.
- [x] Run `cargo fmt --check` and desktop compilation/tests where the required Rust toolchain is available.

### Task 5: Review, verify, and commit without releasing

- [x] Inspect the diff for business-scope changes, secret leakage, and accidental version/release edits.
- [x] Run repository tests plus available Rust and Android checks.
- [x] Confirm no release/tag/publication command is run.
- [x] Commit the implementation and report the commit hash and any environment-limited checks.
