# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning.

## [0.2.0] - Unreleased

### Added

- Android Lab shows the latest Lab release announcement once per version and keeps it available from the account menu.
- Android Lab supports independently updated Matrix compatibility profiles.

## [0.1.3] - 2026-09-22

### Added

- Bilingual, crawlable public pages for VRChat and YouTube VR, including app details, installation steps, FAQs, canonical URLs, alternate-language links, JSON-LD, sitemap, and robots rules.
- A dedicated guide for installing international PICO apps from a China-region headset without changing the headset region, using the user’s own PICO international account.
- Static download/about pages, app media metadata, social preview assets, site verification files, and privacy-aware aggregate discovery counters.

### Changed

- The website now serves generated pages for search engines and AI answer systems while keeping the existing same-origin sign-in and download flow.
- README links now point directly to the public app pages, guide, and client downloads.

## [0.1.2] - 2026-09-19

### Added

- Native GPUI desktop app for Windows, macOS, and Linux, with application search, email sign-in, and a save dialog for APK downloads.
- Browser downloads and PICO international account registration links.
- Desktop installers for x64 and ARM64, plus Python CLI and SDK package distributions.
- Website icons and English/Chinese screenshots in the getting-started guide.
- Update checks in desktop and Android apps.

### Changed

- Use system credential storage in the desktop and Python clients, and Android Keystore encryption for saved Android sessions.
- Put browser downloads first in the guide and simplify installation and account instructions.
- Give app descriptions and screenshots priority on the website, with a direct path to download.
- Redesign the Android catalog, app details, and account dialog in the project’s visual style.
- Remove the browser's downloaded-file verification panel.

### Fixed

- Preserve the signed-in display when switching the website language.
- Handle alphanumeric email codes, failed logout, stale download links, and interrupted downloads consistently.
- Require a deliberate action to claim a free app and correctly resume downloads when the app version changes.

## [0.1.1] - 2026-09-18

### Fixed

- Recheck account entitlement after a free claim that committed but returned no order ID; all four SDKs retain the ownership-before-download rule.
- Show the owned paid-app download state after sign-in, track real download progress, support system/light/dark themes with readable input text, and permit mixed-case verification codes on Android.


## [0.1.0] - 2026-09-18

### Added

- Python, TypeScript, Rust, and Kotlin SDKs for catalog search, account sign-in, item lookup, free-offer acquisition, authenticated download metadata, and verified APK downloads.
- Configurable store request profiles for device identity, language, region, and endpoints.
- Rust desktop and Python command-line clients.
- Native Kotlin/Jetpack Compose Android storefront with search, favorites, account sign-in, official listing details, and system-confirmed installation. Downloads are retained in `Downloads/PICO Store Lab`.
- English and Chinese documentation and Android UI.
- Cloudflare catalog and public release metadata at `pico.kanglives.top`.
