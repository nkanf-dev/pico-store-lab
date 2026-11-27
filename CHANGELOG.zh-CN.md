# 更新日志

所有重要变更遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## [未发布]

### 新增

- 网站与 TypeScript SDK 支持中国大陆商店。网页下载面板新增**国际区 / 中国（大陆）**切换；搜索与应用详情匿名可用，并按区域访问 `appstore-cn.picoxr.com`；国区登录使用 `matrix-cn.picovr.com` 的手机短信验证码；会话按区域隔离，国际区（邮箱）与国区（手机号）登录可以同时存在，每次下载各自使用对应区域的授权。SDK 新增 `StoreRegion`、`storeOptionsForRegion`、`makeMobileAccountRequest`，以及客户端的 `sendMobileCode` / `loginMobile`，国区客户端身份固定为 B3110 设备档案。

- Python CLI 的 `login-window`（别名 `login-gui`）会在独立浏览器窗口中打开 PICO 官方登录页，通过 Chrome DevTools Protocol 捕获登录后的会话，向账号服务校验后自动关闭窗口，并保存该区域的登录状态。需要安装 Chromium 内核浏览器（优先 Edge 与 Chrome；Chromium、Brave、Vivaldi、Opera、Thorium、Arc 也可；不支持 Firefox 与 Safari），窗口使用隔离的临时浏览器配置。

- Python CLI 的 `search --price free` 与 `search --price paid` 可按免费或付费筛选当前搜索结果；SDK 提供 `PicoStoreClient.search(price=...)`、`filter_search_items`、`is_free_price` 与 `is_paid_price`。

- 本地开发服务器为中国区面板加入官方窗口登录：用户在官方浏览器中完成手机验证及可能出现的滑块，本地服务器捕获并校验会话；托管 Worker 上仍仅支持本地登录。

- 网站搜索在两个区域都新增 **全部 / 免费 / 付费** 价格筛选，并在结果卡片中显示价格。区域切换位于页头，并跨页面保持。

- **全部应用**页使用 20 / 50 / 100 / 全部 的每页条数选择器，以及**上一页** / **下一页**按钮分页。接近当前页末尾时会预加载下一页；选择**全部**时按 100 条一批随滚动加载。
- 首页推荐卡片以及目录、搜索、收藏列表统一使用与应用详情页标题左侧相同的方形图标。`GET /api/icons` 每次最多解析 50 个应用图标，所有列表都会在渲染前完成图标解析，因此首屏即显示详情页图标，而不是封面图。

### 变更

- `GET /api/apps` 在 `region`、`device`、`sort` 之外新增 `page`、`pageSize`、`category`、`price` 与 `q`，并返回 `total`、`page`、`pageSize`、`pageTotal` 及分页后的 `items`。当 Worker Cache API 不可用时，列表响应回退到进程内缓存，保证本地 Node 预览无需每次重新抓取商店即可快速响应。

- CI 在 Ubuntu、Windows 与 macOS 上运行 Python 代码检查与测试。

- Python CLI 的 `--locale zh-CN` 可本地化帮助、验证码提示、校验错误与结果消息。默认仍为英文；locale 不会改变商店区域。

### 修复

- Python CLI 的 `search` 与 `status` 直接输出非 ASCII 应用名（UTF-8），不再显示 `\uXXXX` 转义。

- 本地开发服务器的官方窗口登录现在可以在 Windows 上找到 `Program Files (x86)` 下的 32 位 Microsoft Edge，以及 `%LOCALAPPDATA%` 下按用户安装的 Chrome。

- 内嵌浏览器登录在各平台保留已发现的浏览器可执行文件路径，并用英文报告 SDK 错误。

- Python CLI 的 `login-window --region cn` 会打开国区网页 SSO 的官方入口（`sso.picoxr.com/passport/`），并固定官方网页客户端参数（`aid=264297`、`account_sdk_source=sso`、`sdk_version=2.2.2`、`language=zh`），不再依赖页面未公开的默认值；国际区链接保持不变。由于直接命令行短信流程缺少官方设备注册与风控 SDK，可能被 PICO 设备风控拒绝（例如错误 7），文档改为推荐使用 `login-window`。

## [0.2.0] - 2026-09-23

### 新增

- Android Lab 会在每个版本首次展示最新 Lab 发布公告，并可从账号菜单再次查看。
- Android Lab 支持独立更新的 Matrix 兼容性配置。
- Android Lab 为受支持的应用提供国际区 PICO 登录适配，包括 Virtual Desktop 配置，以及适用于其他 Matrix 应用的通用配置。
- Virtual Desktop 拥有独立目录页并出现在推荐应用中；网站新增登录指南与技术原理说明。

### 变更

- 配置匹配优先使用应用专属配置；当已安装版本与已验证版本不同时，仍可尝试匹配。
- Android 在安装依赖 PICO 账号组件的未适配应用前会给出警告。

## [0.1.3] - 2026-09-22

### 新增

- 为 VRChat 与 YouTube VR 提供双语、可被爬虫抓取的公开页面，包含应用详情、安装步骤、常见问题、canonical 链接、多语言 alternate 链接、JSON-LD、sitemap 与 robots 规则。
- 新增专门指南，介绍如何在国区头显上使用自己的 PICO 国际区账号安装国际区应用，而无需切换头显区域。
- 新增静态下载页、关于页、应用媒体元数据、社交预览素材、站点验证文件，以及注重隐私的聚合发现计数。

### 变更

- 网站现在为搜索引擎与 AI 问答系统生成页面，同时保留同源的登录与下载流程。
- README 链接直接指向公开的应用页、指南与客户端下载。

## [0.1.2] - 2026-09-19

### 新增

- 原生 GPUI 桌面应用支持 Windows、macOS 与 Linux，包含应用搜索、邮箱登录与 APK 下载保存对话框。
- 浏览器下载与 PICO 国际区账号注册链接。
- x64 与 ARM64 桌面安装包，以及 Python CLI 与 SDK 发行包。
- 入门指南中的网站图标与中英文截图。
- 桌面端与 Android 端的更新检查。

### 变更

- 桌面端与 Python 客户端使用系统凭据存储，Android 保存的会话使用 Android Keystore 加密。
- 指南优先介绍浏览器下载，并简化安装与账号说明。
- 网站优先展示应用简介与截图，并提供直达下载的入口。
- 按项目视觉风格重新设计 Android 目录、应用详情与账号弹窗。
- 移除浏览器的下载文件校验面板。

### 修复

- 切换网站语言时保留已登录状态的显示。
- 统一处理字母数字邮箱验证码、退出失败、过期下载链接与中断的下载。
- 领取免费应用需要明确操作；应用版本变化后能正确恢复下载。

## [0.1.1] - 2026-09-18

### 修复

- 免费领取已提交但未返回订单 ID 时，重新检查账号权益；四个 SDK 均保留“先确认所有权再下载”的规则。
- 登录后显示已拥有的付费应用下载状态，跟踪真实下载进度，支持系统 / 浅色 / 深色主题与可读的输入文字，并允许 Android 上大小写混合的验证码。


## [0.1.0] - 2026-09-18

### 新增

- Python、TypeScript、Rust 与 Kotlin SDK，支持目录搜索、账号登录、应用查询、免费领取、带授权的下载元数据，以及校验后的 APK 下载。
- 可配置的商店请求档案，涵盖设备身份、语言、区域与端点。
- Rust 桌面客户端与 Python 命令行客户端。
- 原生 Kotlin/Jetpack Compose Android 商店，包含搜索、收藏、账号登录、官方详情页与系统确认安装。下载文件保存在 `Downloads/PICO Store Lab`。
- 英文与中文文档及 Android 界面。
- 位于 `pico.kanglives.top` 的 Cloudflare 目录与公开发布元数据。
