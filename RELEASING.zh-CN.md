# 发布流程

[English](RELEASING.md)

先发布 GitHub，再逐一发布并核验所需的包注册表。Maven Central 另行处理。

1. 同步更新四套 SDK 与 Android 的版本号、变更记录；保持中英文 README 示例不含产品版本号，并检查稳定的 Release 附件名称。
2. 本地执行 SDK 测试和 Android 构建，并等待 CI 全绿；构建 Python wheel/sdist、TS 包、Rust crate 检查、Kotlin AAR 和 Android APK。
3. 审查 Git 历史和打包内容，排除密钥、会话、APK、签名链接和大文件。
4. 应用远端 D1 迁移后用 Wrangler 部署 `apps/website`，核验 `https://pico.kanglives.top/`、`/api/catalog`、`/api/search` 和 `/api/releases`。公开目录接口不得暴露账号凭据或签名下载链接；APK 下载需要登录。若推迟部署，需要在发布说明中说明。
5. 为已验证提交打 `vX.Y.Z` 标签并创建 GitHub Release，仅附 SDK/构建产物和校验值。发布说明描述功能变化与安装方式。
6. 登录各注册表，依次发布 Python 包到 PyPI、Rust crate 到 crates.io、TypeScript 包到 npm；分别核验版本和包内容。一次上传结果不明时先查询注册表再重试，避免重复发布。
7. 从 GitHub 核验公开仓库、标签、产物列表和校验值。发布失败时报告确切阶段，不声称成功。

MIT 只授权本项目代码，不授权再分发第三方 APK。
