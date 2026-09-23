# Matrix Bridge 本地接入

Android 开发版可调用 Matrix Bridge 的共用账号、应用适配和安装组件。目录、购买及下载仍使用 Store SDK；新的账号会话会迁移旧的加密登录状态。未启用集成的构建保持现有行为。

先在本地 Matrix Bridge checkout 构建 release 兼容 bundle，准备已签名的 profile APK，再指定 Gradle 属性：

```sh
cd apps/android
./gradlew :app:testDebugUnitTest :app:assembleDebug \
  -PmatrixBridgeDir=/absolute/source/pico-matrix-bridge \
  -PmatrixBundleDir=/absolute/research/analysis/build-001/compatibility-bundle \
  -PmatrixProfileDir=/absolute/research/analysis/build-001/profiles \
  -PmatrixProfileSignerSha256=<publisher-certificate-sha256>
```

`matrixBridgeDir` 使用 Gradle composite build 引入 `installer-android`，以及它依赖的账号与适配库。`matrixBundleDir` 是包含 `bundle.json` 的完整目录；`matrixProfileDir` 包含独立签名的 `matrix-profile-*.apk`。构建将 bundle 和 profiles 放进 Lab APK 的 assets。构建不会自动安装头显或发布产物。

普通 Lab 的检查命令不需要私有仓库：

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

两种构建使用相同输出位置，以最近一次构建为准。运行时流程是下载校验 → 应用检测 → 必要时准备副本 → 系统安装确认 → 安装结果核验 → 应用账号交接。已知应用的其他版本会显示“尝试适配”，不会因版本号或整包哈希不同而预先拒绝；关键补丁输入不匹配时准备失败，原始下载和已安装应用保留。交接失败时应用已安装，可打开后登录。
