# PICO Store Lab Desktop

A native desktop app built with [GPUI](https://www.gpui.rs/). Search PICO apps, sign in with your PICO international account, and download APKs to install on your headset.

[Download for Windows, macOS, or Linux](https://github.com/nkanf-dev/pico-store-lab/releases/latest) · [中文使用指南](../../README.zh-CN.md#3-windowsmacos-与-linux-桌面客户端)

## Install

- **Windows:** Run the installer and open PICO Store Lab from the Start menu. A portable ZIP is also available.
- **macOS:** Open the DMG and drag PICO Store Lab into Applications.
- **Linux:** Allow the AppImage to run as a program in its file properties, then double-click to open it.

Choose the x64 build for Intel/AMD computers or the ARM64 build for Apple silicon and other ARM computers.

## Use

1. Search for an app, or choose one from the list.
2. Enter your PICO international account email, send a verification code, and sign in. New to PICO? [Register an account](https://sso-global.picoxr.com/) using **Sign Up**, then come back to sign in.
3. Click **Download APK** (or **Get & download APK** for a free app) and choose where to save it.
4. Install the file with your headset's APK installer or ADB.

Paid apps must be purchased in the PICO Store first. Available apps can vary by account region. Use the language button to switch between English and Chinese.

## Build from source

With Rust stable installed:

```sh
cargo install pico-store-desktop --locked
pico-store-desktop
```

From this repository, use `cargo run -p pico-store-desktop`. Linux build dependencies are listed in `.github/actions/linux-desktop/action.yml`.
