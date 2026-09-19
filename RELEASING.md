# Release procedure

[简体中文](RELEASING.zh-CN.md)

Publish GitHub first, then the requested package registries. Each registry publication is verified independently. Maven Central is a separate future step.

1. Bump the shared release version in `packages/ts/package.json`, `packages/python/pyproject.toml`, `Cargo.toml`, `packages/kotlin/build.gradle`, and Android `versionName`; update `CHANGELOG.md`. Keep both README examples versionless and check that the stable release-asset names still work.
2. Run focused SDK tests and Android build checks locally, then wait for green CI. Package the Python wheel/sdist, TypeScript tarball, Rust crate dry-run, Kotlin AAR, and Android debug APK.
3. Inspect tracked files and Git history for secrets and large binaries; review `npm pack --dry-run`, `cargo package --list`, and Python wheel contents. Never attach auth files, official APKs, signed URLs, or private data.
4. Deploy `apps/website` with Wrangler after applying D1 migrations remotely; verify `https://pico.kanglives.top/`, `/api/catalog`, `/api/search` and `/api/releases`. Public catalog endpoints must not expose account credentials or signed download links; APK downloads require a signed-in session. If deployment is intentionally deferred, say so in the release notes.
5. Tag the verified commit with `vX.Y.Z` and create a GitHub Release. Attach only SDK/build artifacts with checksums. Describe the changes and installation options in the release notes.
6. Publish the Python package to PyPI, the Rust crate to crates.io, and the TypeScript package to npm after authenticating each registry. Verify the version and package contents from each registry, and record any incomplete registry separately. Never retry an upload before checking whether the first attempt landed.
7. Verify the public repository, tag, release asset list, and checksums from GitHub. A failed step is reported as incomplete; do not silently retry publication in a way that could duplicate releases.

The code license is MIT. It does not grant redistribution rights to third-party APKs.
