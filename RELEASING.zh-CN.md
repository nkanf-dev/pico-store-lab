# 发布流程

[English](RELEASING.md)

先发布 GitHub，再逐一发布并核验所需的包注册表。Maven Central 另行处理。

1. 同步更新四套 SDK 与 Android 的版本号、变更记录；保持中英文 README 示例不含产品版本号，并检查稳定的 Release 附件名称。
2. 本地执行重点检查并等待 CI 全绿。正式 Android、桌面版和 SDK 附件均由 GitHub Actions 从发布标签构建。
3. 审查 Git 历史和打包内容，排除密钥、会话、APK、签名链接和大文件。
4. 应用远端 D1 迁移后用 Wrangler 部署 `apps/website`，核验 `https://pico.kanglives.top/`、`/api/catalog`、`/api/search` 和 `/api/releases`。公开目录接口不得暴露账号凭据或签名下载链接；APK 下载需要登录。若推迟部署，需要在发布说明中说明。
5. 提交 `docs/releases/X.Y.Z.md`，为已验证提交打 `vX.Y.Z` 标签。在 `main` 运行 `Prepare Lab release` 创建草稿，暂存 Android 构建所需的私有 Matrix 输入，再依次运行 `Build release downloads`、`Attach desktop release downloads` 和 `Build and attach signed Android release`。最后运行 `Finalize Lab release`，由 CI 构建 SDK 附件、核验全部校验值、清除私有输入并发布 GitHub Release。Android 签名密钥由 `android-publishing` 环境 Secrets 提供。
6. 登录各注册表，依次发布 Python 包到 PyPI、Rust crate 到 crates.io、TypeScript 包到 npm；分别核验版本和包内容。一次上传结果不明时先查询注册表再重试，避免重复发布。
7. 从 GitHub 核验公开仓库、标签、产物列表和校验值。发布失败时报告确切阶段，不声称成功。

MIT 只授权本项目代码，不授权再分发第三方 APK。
