"""Bundle the native desktop app for the current release target."""

from __future__ import annotations

import argparse
import hashlib
import os
import plistlib
import shutil
import subprocess
import tomllib
import urllib.request
from pathlib import Path


def run(*args: str) -> None:
    """Run one packaging command, failing on incomplete output."""
    subprocess.run(args, check=True)


def main() -> None:
    """Create native installers, portable archives, and checksums."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--host-build", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    version = tomllib.loads((root / "Cargo.toml").read_text())["workspace"]["package"][
        "version"
    ]
    windows = "windows" in args.target
    macos = "apple" in args.target
    binary = "pico-store-desktop.exe" if windows else "pico-store-desktop"
    built = root / "target"
    if not args.host_build:
        built /= args.target
    built = built / "release" / binary
    stage = root / "build" / f"pico-store-desktop-{args.name}"
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    output = root / "dist"
    output.mkdir(exist_ok=True)
    assets = root / "apps" / "desktop-rs" / "assets"
    products: list[Path] = []
    if macos:
        app = stage / "PICO Store Lab.app"
        contents = app / "Contents"
        (contents / "MacOS").mkdir(parents=True)
        (contents / "Resources").mkdir()
        shutil.copy2(built, contents / "MacOS" / binary)
        shutil.copy2(assets / "app.icns", contents / "Resources" / "app.icns")
        info = {
            "CFBundleIdentifier": "dev.nkanf.picostore.desktop",
            "CFBundleName": "PICO Store Lab",
            "CFBundleDisplayName": "PICO Store Lab",
            "CFBundleExecutable": binary,
            "CFBundlePackageType": "APPL",
            "CFBundleShortVersionString": version,
            "CFBundleVersion": version,
            "CFBundleIconFile": "app.icns",
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "13.5",
        }
        (contents / "Info.plist").write_bytes(plistlib.dumps(info))
        run("codesign", "--force", "--deep", "--sign", "-", str(app))
        (stage / "Applications").symlink_to("/Applications")
        dmg = output / f"{stage.name}.dmg"
        run(
            "hdiutil",
            "create",
            "-ov",
            "-volname",
            "PICO Store Lab",
            "-srcfolder",
            str(stage),
            "-format",
            "UDZO",
            str(dmg),
        )
        products.append(dmg)
    else:
        shutil.copy2(built, stage / binary)
        shutil.copy2(root / "LICENSE", stage / "LICENSE")
        shutil.copy2(root / "apps" / "desktop-rs" / "README.md", stage / "README.md")
        shutil.copy2(assets / "app.png", stage / "app.png")
        if windows:
            shutil.copy2(assets / "app.ico", stage / "app.ico")
        else:
            os.chmod(stage / binary, 0o755)
            shutil.copy2(
                assets / "dev.nkanf.picostore.desktop",
                stage / "dev.nkanf.picostore.desktop",
            )
        if windows:
            products.append(
                Path(
                    shutil.make_archive(str(output / stage.name), "zip", root_dir=stage)
                )
            )
            installer = output / f"{stage.name}.exe"
            script = root / "build" / "installer.nsi"
            script.write_text(f'''Unicode True
Name "PICO Store Lab"
OutFile "{installer}"
InstallDir "$LOCALAPPDATA\\Programs\\PICO Store Lab"
RequestExecutionLevel user
Icon "{assets / "app.ico"}"
UninstallIcon "{assets / "app.ico"}"
!include "MUI2.nsh"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section
SetOutPath "$INSTDIR"
File "{stage / binary}"
File "{stage / "LICENSE"}"
File "{stage / "app.ico"}"
WriteUninstaller "$INSTDIR\\Uninstall.exe"
CreateShortcut "$SMPROGRAMS\\PICO Store Lab.lnk" "$INSTDIR\\{binary}" "" "$INSTDIR\\app.ico"
WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PicoStoreLab" "DisplayName" "PICO Store Lab"
WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PicoStoreLab" "DisplayVersion" "{version}"
WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PicoStoreLab" "UninstallString" '$"$INSTDIR\\Uninstall.exe$"'
WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PicoStoreLab" "DisplayIcon" "$INSTDIR\\app.ico"
SectionEnd
Section "Uninstall"
Delete "$SMPROGRAMS\\PICO Store Lab.lnk"
Delete "$INSTDIR\\{binary}"
Delete "$INSTDIR\\LICENSE"
Delete "$INSTDIR\\app.ico"
Delete "$INSTDIR\\Uninstall.exe"
RMDir "$INSTDIR"
DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PicoStoreLab"
SectionEnd
''')
            makensis = (
                shutil.which("makensis") or r"C:\Program Files (x86)\NSIS\makensis.exe"
            )
            run(makensis, str(script))
            products.append(installer)
        else:
            arch = "aarch64" if args.name.endswith("arm64") else "x86_64"
            appdir = root / "build" / f"PicoStoreLab-{arch}.AppDir"
            if appdir.exists():
                shutil.rmtree(appdir)
            appdir.mkdir()
            tool = root / "build" / f"linuxdeploy-{arch}.AppImage"
            url = f"https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/{tool.name}"
            # Verify the upstream release asset before executing the packaging tool.
            checksums = {
                "aarch64": "556ab80baa98e600aa80f0dcedfb70bca0e1ce7e9f147fb345be3fcc3e91b2b1",
                "x86_64": "36a2d7e274d12e1050d0e9ecfe11d339ed54720b2bec464c286d53f8b07f5c62",
            }
            urllib.request.urlretrieve(url, tool)
            if hashlib.sha256(tool.read_bytes()).hexdigest() != checksums[arch]:
                raise RuntimeError(
                    "linuxdeploy release changed; review and update its checksum"
                )
            os.chmod(tool, 0o755)
            icon = stage / "dev.nkanf.picostore.png"
            shutil.copy2(assets / "app.png", icon)
            image = output / f"{stage.name}.AppImage"
            env = dict(
                os.environ,
                APPIMAGE_EXTRACT_AND_RUN="1",
                OUTPUT=str(image),
                VERSION=version,
                ARCH=arch,
            )
            subprocess.run(
                [
                    str(tool),
                    "--appdir",
                    str(appdir),
                    "--executable",
                    str(built),
                    "--desktop-file",
                    str(assets / "dev.nkanf.picostore.desktop"),
                    "--icon-file",
                    str(icon),
                    "--output",
                    "appimage",
                ],
                env=env,
                check=True,
            )
            products.append(image)
    for product in products:
        with product.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        (output / f"{product.name}.sha256").write_text(f"{digest}  {product.name}\n")
        print(f"{product.name}: {product.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
