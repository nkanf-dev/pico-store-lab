# Release procedure

[简体中文](RELEASING.zh-CN.md)

Publish GitHub first, then the requested package registries. Each registry publication is verified independently. Maven Central is a separate future step.

1. Bump the shared release version in `packages/ts/package.json`, `packages/python/pyproject.toml`, `Cargo.toml`, `packages/kotlin/build.gradle`, and Android `versionName`; update `CHANGELOG.md`. Keep both README examples versionless and check that the stable release-asset names still work.
2. Run focused checks locally and wait for green CI. Final Android, desktop, and SDK release assets are built by GitHub Actions from the release tag.
3. Inspect tracked files and Git history for secrets and large binaries; review `npm pack --dry-run`, `cargo package --list`, and Python wheel contents. Never attach auth files, official APKs, signed URLs, or private data.
4. Deploy `apps/website` with Wrangler after applying D1 migrations remotely; verify `https://pico.kanglives.top/`, `/api/catalog`, `/api/search` and `/api/releases`. Public catalog endpoints must not expose account credentials or signed download links; APK downloads require a signed-in session. If deployment is intentionally deferred, say so in the release notes.
5. Commit `docs/releases/X.Y.Z.md` and tag the verified commit with `vX.Y.Z`. Run `Prepare Lab release` on `main` to create the draft. Stage the private Matrix bundle input for the Android job, then run `Build release downloads`, `Attach desktop release downloads`, and `Build and attach signed Android release` against the tag. Run `Finalize Lab release` to build SDK assets, verify every digest, remove private input, and publish the GitHub Release. The Android signing keystore is provided through the `android-publishing` environment secrets.
6. Publish the Python package to PyPI, the Rust crate to crates.io, and the TypeScript package to npm after authenticating each registry. Verify the version and package contents from each registry, and record any incomplete registry separately. Never retry an upload before checking whether the first attempt landed.
7. Verify the public repository, tag, release asset list, and checksums from GitHub. A failed step is reported as incomplete; do not silently retry publication in a way that could duplicate releases.

The code license is MIT. It does not grant redistribution rights to third-party APKs.
