# PICO Store Lab — Kotlin SDK

Android-compatible Kotlin client for search, item lookup, email sign-in, authenticated download metadata and verified APK acquisition. Protocol builders, validators, mirror policy and a replaceable transport are public. The PICO Android client includes this module directly. Download the AAR from [GitHub Releases](https://github.com/nkanf-dev/pico-store-lab/releases/latest), or include this module in your Gradle build.

```kotlin
val client = PicoStoreClient()
val found = client.search("YouTube VR").first()
val target = StoreTarget(found.itemId, found.packageName)
client.item(target)
client.sendCode(email)
val auth = client.login(email, codeFromUser)
client.download(target, auth, File("selected-app.apk"))
```

Set a request profile with `PicoStoreClient(config = PicoStoreConfig(deviceName = "YOUR_DEVICE", language = "en", zone = "Europe/London", webRegion = "uk"))`. `PicoStoreConfig` also exposes `storeHost`, `accountHost`, `webStoreHost`, `manifestVersionCode`, `appId`, `clientType`, `passportAid`, and `devicePlatform`. Defaults reflect the observed A9210/Japanese-language overseas-store profile. Use an exact `StoreTarget` from search for any app. `download()` confirms ownership, acquires an available free offer when needed, then requests download metadata. Paid offers require an official-store purchase first.

Your UI supplies `email` and `codeFromUser`. To install the verified APK on a headset, request Android's normal package-installer confirmation; see the [player guide](https://github.com/nkanf-dev/pico-store-lab#player-guide).
