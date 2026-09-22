#!/usr/bin/env python3
r"""Build and verify the Android release APK without publishing it.

Set PICO_ANDROID_KEYSTORE, PICO_ANDROID_KEY_ALIAS,
PICO_ANDROID_STORE_PASSWORD and PICO_ANDROID_KEY_PASSWORD explicitly.
The signing key must match the installed release's certificate.

Example:
    python tools/build_android_release.py --output-dir dist/android \
        --matrix-bridge-dir ../pico-matrix-bridge \
        --matrix-bundle-dir /path/to/compatibility-bundle

Use --previous-apk to also require a higher version code than an earlier release.
Passwords are read from the environment, never command-line arguments.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

PACKAGE = "dev.nkanf.picostore"
ASSET_NAME = "pico-store-android.apk"
# Public certificate of the canonical v0.1.3 GitHub release asset.
RELEASE_SIGNER_SHA256 = (
    "ee542bcbef36f2cc9aac289c7938ea2a4bb137742cb74b82744481a94c877701"
)
SIGNING_ENV = (
    "PICO_ANDROID_KEYSTORE",
    "PICO_ANDROID_KEY_ALIAS",
    "PICO_ANDROID_STORE_PASSWORD",
    "PICO_ANDROID_KEY_PASSWORD",
)


def checked(command: list[str], *, cwd: Path | None = None) -> str:
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        message = result.stdout + result.stderr
        for name in SIGNING_ENV[2:]:
            password = os.environ.get(name)
            if password:
                message = message.replace(password, "<redacted>")
        raise RuntimeError(f"{Path(command[0]).name} failed:\n{message[-12000:]}")
    return result.stdout


def certificate_digests(output: str) -> set[str]:
    return {
        value.lower()
        for value in re.findall(
            r"Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})",
            output,
            re.IGNORECASE,
        )
    }


def verify_apk(apk: Path, apksigner: Path, aapt: Path) -> tuple[str, int]:
    signatures = checked(
        [str(apksigner), "verify", "--verbose", "--print-certs", str(apk)]
    )
    if certificate_digests(signatures) != {RELEASE_SIGNER_SHA256}:
        raise RuntimeError("APK signer differs from the existing Android release")
    manifest = checked([str(aapt), "dump", "badging", str(apk)])
    package = re.search(
        r"^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'",
        manifest,
        re.MULTILINE,
    )
    if not package or package[1] != PACKAGE:
        raise RuntimeError("Unexpected APK application ID")
    if "application-debuggable" in manifest:
        raise RuntimeError("Refusing to package a debuggable APK")
    if not re.fullmatch(
        r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", package[3]
    ):
        raise RuntimeError("Android release version must be a stable semantic version")
    return package[3], int(package[2])


def build_tools(sdk: Path) -> tuple[Path, Path]:
    folder = sdk / "build-tools"
    versions = (
        [
            path
            for path in folder.iterdir()
            if path.is_dir() and re.fullmatch(r"\d+\.\d+\.\d+", path.name)
        ]
        if folder.is_dir()
        else []
    )
    if not versions:
        raise RuntimeError("Install a stable Android SDK build-tools version first")
    selected = max(
        versions, key=lambda path: tuple(int(part) for part in path.name.split("."))
    )
    apksigner = selected / ("apksigner.bat" if os.name == "nt" else "apksigner")
    aapt = selected / ("aapt2.exe" if os.name == "nt" else "aapt2")
    if not apksigner.is_file() or not aapt.is_file():
        raise RuntimeError("Selected Android build-tools lacks apksigner or aapt2")
    return apksigner, aapt


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--output-dir", type=Path, default=root / "dist" / "android")
    parser.add_argument("--matrix-bridge-dir", type=Path)
    parser.add_argument("--matrix-bundle-dir", type=Path)
    parser.add_argument("--previous-apk", type=Path)
    args = parser.parse_args()
    missing = [name for name in SIGNING_ENV if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            "Set the signing environment explicitly: " + ", ".join(missing)
        )
    keystore = Path(os.environ[SIGNING_ENV[0]]).expanduser().resolve(strict=True)
    if not keystore.is_file():
        raise RuntimeError("PICO_ANDROID_KEYSTORE must name an existing keystore file")
    os.environ[SIGNING_ENV[0]] = str(keystore)
    sdk_value = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk_value:
        raise RuntimeError("Set ANDROID_HOME to the Android SDK directory")
    apksigner, aapt = build_tools(Path(sdk_value).expanduser().resolve(strict=True))
    keytool_name = "keytool.exe" if os.name == "nt" else "keytool"
    java_home = os.environ.get("JAVA_HOME")
    keytool = (
        str(Path(java_home) / "bin" / keytool_name)
        if java_home
        else shutil.which(keytool_name)
    )
    if not keytool:
        raise RuntimeError("Set JAVA_HOME to a JDK with keytool")
    certificate = checked(
        [
            keytool,
            "-J-Duser.language=en",
            "-J-Duser.country=US",
            "-list",
            "-v",
            "-keystore",
            str(keystore),
            "-alias",
            os.environ[SIGNING_ENV[1]],
            "-storepass:env",
            SIGNING_ENV[2],
        ]
    )
    fingerprints = {
        value.replace(":", "").lower()
        for value in re.findall(r"SHA256:\s*([A-Fa-f0-9:]{95})", certificate)
    }
    if fingerprints != {RELEASE_SIGNER_SHA256}:
        raise RuntimeError(
            "Selected key cannot update the existing Android release; use its original signing key"
        )
    if bool(args.matrix_bridge_dir) != bool(args.matrix_bundle_dir):
        raise RuntimeError("Provide both --matrix-bridge-dir and --matrix-bundle-dir")
    android = root / "apps" / "android"
    command = [
        str(android / ("gradlew.bat" if os.name == "nt" else "gradlew")),
        "--no-daemon",
        "--no-configuration-cache",
        ":app:assembleRelease",
        "--console=plain",
    ]
    if args.matrix_bridge_dir:
        bridge = args.matrix_bridge_dir.expanduser().resolve(strict=True)
        bundle = args.matrix_bundle_dir.expanduser().resolve(strict=True)
        if (
            not (bridge / "settings.gradle").is_file()
            or not (bundle / "bundle.json").is_file()
        ):
            raise RuntimeError(
                "Provide a Matrix Bridge checkout and a prepared compatibility bundle"
            )
        command.extend([f"-PmatrixBridgeDir={bridge}", f"-PmatrixBundleDir={bundle}"])
    print("Building Android release…", flush=True)
    checked(command, cwd=android)
    release_dir = android / "app" / "build" / "outputs" / "apk" / "release"
    metadata = json.loads((release_dir / "output-metadata.json").read_text())
    elements = metadata.get("elements", [])
    if metadata.get("applicationId") != PACKAGE or len(elements) != 1:
        raise RuntimeError("Expected one universal Android release APK")
    artifact = elements[0].get("outputFile", "")
    if not artifact or Path(artifact).name != artifact or not artifact.endswith(".apk"):
        raise RuntimeError("Unexpected release output path")
    apk = release_dir / artifact
    version, version_code = verify_apk(apk, apksigner, aapt)
    if (elements[0].get("versionName"), elements[0].get("versionCode")) != (
        version,
        version_code,
    ):
        raise RuntimeError("Gradle output metadata does not match the signed APK")
    with zipfile.ZipFile(apk) as archive:
        includes_bridge = "assets/matrix-bridge/bundle.json" in archive.namelist()
        if includes_bridge != bool(args.matrix_bridge_dir):
            raise RuntimeError(
                "APK compatibility assets do not match the requested build"
            )
    if args.previous_apk:
        previous = args.previous_apk.expanduser().resolve(strict=True)
        # Older releases may be debuggable; continuity only needs identity, signature and version code.
        signatures = checked([str(apksigner), "verify", "--print-certs", str(previous)])
        if certificate_digests(signatures) != {RELEASE_SIGNER_SHA256}:
            raise RuntimeError("Previous APK has an unexpected signer")
        info = checked([str(aapt), "dump", "badging", str(previous)])
        prior = re.search(
            r"^package: name='([^']+)' versionCode='([0-9]+)'", info, re.MULTILINE
        )
        if not prior or prior[1] != PACKAGE or version_code <= int(prior[2]):
            raise RuntimeError(
                "Release versionCode must be higher than the previous APK"
            )
    destination = args.output_dir.expanduser().resolve()
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / ASSET_NAME
    partial = destination / (ASSET_NAME + ".part")
    checksum_part = destination / "SHA256SUMS.part"
    try:
        with apk.open("rb") as source, partial.open("wb") as target:
            shutil.copyfileobj(source, target, 1024 * 1024)
            target.flush()
            os.fsync(target.fileno())
        digest = digest_file(partial)
        if digest != digest_file(apk):
            raise RuntimeError("Release APK changed while packaging")
        partial.replace(output)
        checksum_part.write_text(f"{digest}  {ASSET_NAME}\n")
        checksum_part.replace(destination / "SHA256SUMS")
    finally:
        partial.unlink(missing_ok=True)
        checksum_part.unlink(missing_ok=True)
    print(f"Android {version} ({version_code}): {output}")
    print(f"SHA256: {digest}")
    print(f"Signer: {RELEASE_SIGNER_SHA256}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Android packaging failed: {error}", file=sys.stderr)
        raise SystemExit(1) from None
