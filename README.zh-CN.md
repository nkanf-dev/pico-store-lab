![PICO Store Lab 横幅](assets/brand/banner.svg)

# PICO Store Lab

[![CI](https://github.com/nkanf-dev/pico-store-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/nkanf-dev/pico-store-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-b13a22.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/nkanf-dev/pico-store-lab?include_prereleases&color=b13a22)](https://github.com/nkanf-dev/pico-store-lab/releases)

[English](README.md) · [在线使用](https://pico.kanglives.top/) · [安装指南](https://pico.kanglives.top/guides/install-global-apps/) · [下载客户端](https://pico.kanglives.top/download/)

想在国区 PICO 上装 VRChat、YouTube VR，商店里却搜不到？PICO Store Lab 可以帮你找到应用的 PICO 版本，用自己的 PICO 国际区账号下载，再安装到头显，不需要先给头显转区。

你可以在网页把安装包保存到电脑，也可以使用 Android 客户端，在头显上直接下载并安装。

**[VRChat PICO 版](https://pico.kanglives.top/apps/vrchat/)** · **[YouTube VR PICO 版](https://pico.kanglives.top/apps/youtube-vr/)** · [浏览全部应用](https://pico.kanglives.top/)

![PICO Store Lab 中文首页与应用搜索](assets/screenshots/website-home-zh-CN.webp)

<a id="player-guide"></a>
## 下载与安装

你需要一个 **PICO 国际区账号**。还没有账号？[前往 PICO 官网](https://sso-global.picoxr.com/)，选择 **Sign Up** 注册，完成后回到这里登录。

注册、下载、安装的完整步骤和常见问题，都在[安装指南](https://pico.kanglives.top/guides/install-global-apps/)中。下载前看看应用页的适用设备；装好后，按应用自己的账号和网络要求使用。

不同账号地区可获取的应用可能不同。付费应用请先在 PICO 商店购买，再下载。

### 1. 在网页下载

1. 打开 [VRChat](https://pico.kanglives.top/apps/vrchat/) 或 [YouTube VR](https://pico.kanglives.top/apps/youtube-vr/) 页面，也可以[搜索其他应用](https://pico.kanglives.top/)。
2. 在**网页下载**区域填写 PICO 账号邮箱，点击**发送验证码**，输入收到的邮件验证码后点击**登录**。
3. 尚未领取的免费应用，先点击**领取免费应用**。
4. 点击**下载 APK**。下载完成后，使用头显的 APK 安装器或 ADB 安装。

如果没收到邮件，请查看垃圾邮件，并确认填写的是 PICO 国际区账号的注册邮箱。

![网页下载面板，展示应用版本、文件大小与下载按钮](assets/screenshots/web-download-zh-CN.webp)

### 2. 在头显下载并安装

先在头显上安装 PICO Store Lab，之后就可以直接在头显里查找、下载和安装应用，无需电脑。

1. 从[最新发布](https://github.com/nkanf-dev/pico-store-lab/releases/latest)下载 `pico-store-android.apk`。如果头显有 APK 安装器，可以直接打开文件；也可以开启 USB 调试、连接电脑后通过 ADB 安装：

   ```sh
   adb devices                         # 在头显中同意 USB 调试授权
   adb install -r pico-store-android.apk
   ```

2. 在头显应用库的**未知来源**中打开 **PICO Store Lab**。不同 PICO OS 版本的入口名称可能不同。
3. 搜索应用，用 PICO 国际区账号邮箱和邮件验证码登录。
4. 免费应用点击**获取**，已拥有的应用点击**下载**。按系统提示允许 PICO Store Lab 安装应用，然后确认安装。
5. 尚未购买的付费应用，点击**前往 PICO 商店**购买，再返回下载。

### 3. Windows、macOS 与 Linux 桌面客户端

下载对应系统的安装包，打开 **PICO Store Lab**，即可在窗口中搜索应用、登录账号并下载。

| 系统 | x64 / Intel | ARM64 / Apple 芯片 |
| --- | --- | --- |
| Windows | [Windows x64](https://github.com/nkanf-dev/pico-store-lab/releases/latest/download/pico-store-desktop-windows-x64.exe) | [Windows ARM64](https://github.com/nkanf-dev/pico-store-lab/releases/latest/download/pico-store-desktop-windows-arm64.exe) |
| macOS | [macOS x64](https://github.com/nkanf-dev/pico-store-lab/releases/latest/download/pico-store-desktop-macos-x64.dmg) | [macOS ARM64](https://github.com/nkanf-dev/pico-store-lab/releases/latest/download/pico-store-desktop-macos-arm64.dmg) |
| Linux | [Linux x64](https://github.com/nkanf-dev/pico-store-lab/releases/latest/download/pico-store-desktop-linux-x64.AppImage) | [Linux ARM64](https://github.com/nkanf-dev/pico-store-lab/releases/latest/download/pico-store-desktop-linux-arm64.AppImage) |

- **Windows**：运行安装程序，从开始菜单打开应用。
- **macOS**：打开 DMG，将应用拖入 Applications。
- **Linux**：在文件属性中允许 AppImage 作为程序执行，然后双击打开。

在应用中选择一款应用，使用 PICO 国际区账号登录，点击**下载 APK**并选择保存位置。下载完成后，使用头显的 APK 安装器或 ADB 安装。

桌面窗口和 Android 的账号菜单中均可点击**检查更新**，获取新版本。

### 4. Python 命令行

需要 Python 3.11 或更高版本。创建虚拟环境并安装 CLI，将示例中的邮箱和应用信息替换为你自己的选择。

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install pico-store-lab
pico-store-py search 'YouTube VR'
pico-store-py status --item-id 7270207384512020485 --package com.google.android.apps.youtube.vr.pico
pico-store-py send-code --email you@example.com
pico-store-py login --email you@example.com
pico-store-py download --item-id 7270207384512020485 --package com.google.android.apps.youtube.vr.pico --output ./selected-app.apk
pico-store-py logout
```

Windows 用户请改用 `.venv\Scripts\Activate.ps1` 激活虚拟环境。请选择尚未存在的输出文件名。下载后，用头显安装器或 `adb install -r ./selected-app.apk` 安装。更多选项见 `pico-store-py --help`。

## 开发者文档

项目提供四种语言的 SDK，支持应用搜索、详情查询、邮箱登录和下载。使用示例和配置方法见各 SDK 的 README。

| 组件 | 用途 | 安装 |
| --- | --- | --- |
| [TypeScript SDK](packages/ts/README.md) | Node.js 客户端，也是网站使用的 SDK | `npm install @nkanf-dev/pico-store-sdk` |
| [Python SDK](packages/python/README.md) | Python 客户端与命令行工具 | `pip install pico-store-lab` |
| [Rust SDK](packages/rust/README.md) | 桌面应用使用的 Rust 客户端 | `cargo add pico-store-lab` |
| [Kotlin SDK](packages/kotlin/README.md) | Android 应用使用的 Kotlin 客户端 | — |
| [网站](apps/website) | 中英文应用目录与网页下载 | — |
| [桌面客户端](apps/desktop-rs) | GPUI 原生桌面应用 | `cargo install pico-store-desktop --locked` |
| [Android 客户端](apps/android) | 在 PICO 头显上浏览、下载和安装应用 | — |

### 本地开发

克隆仓库后，运行你需要开发的组件：

```sh
git clone https://github.com/nkanf-dev/pico-store-lab.git
cd pico-store-lab

# TypeScript SDK 与网站：Node.js 25+
npm ci
npm run build:ts
node apps/website/src/dev.js                 # http://127.0.0.1:8787

# Python SDK：Python 3.11+
python3 -m pip install -e packages/python
pico-store-py --help

# Rust SDK 与桌面客户端：Rust stable
cargo run -p pico-store-desktop

# Kotlin SDK 与 Android 客户端：Java 17、Android SDK 37
cd apps/android
./gradlew assembleDebug
```

Android 构建产物位于 `apps/android/app/build/outputs/apk/debug/app-debug.apk`。

开发与测试方法见[参与贡献](CONTRIBUTING.zh-CN.md)，部署和发布方法见[发布流程](RELEASING.zh-CN.md)，安全问题请按[安全报告](SECURITY.md)中的方式反馈。

## 许可证

[MIT](LICENSE)。PICO Store Lab 是独立社区项目，与 PICO 无隶属关系。
