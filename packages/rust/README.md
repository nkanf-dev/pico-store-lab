# PICO Store Lab — Rust SDK

Typed PICO store client for search, item lookup, email sign-in, authenticated download metadata and verified APK acquisition. Protocol builders, response validators, mirror policy and a replaceable transport are public. The GPUI desktop app uses this SDK.

Add the SDK with `cargo add pico-store-lab`. For the native desktop app, use `cargo install pico-store-desktop --locked`, or [download an installer](https://pico.kanglives.top/en/download/).

```rust
use pico_store_lab::{PicoStoreClient, StoreTarget};

let client = PicoStoreClient::default();
let found = client.search("YouTube VR", 1)?.items.remove(0);
let target = StoreTarget::new(&found.item_id, &found.package_name, "")?;
client.item(&target)?;
client.send_code(&email)?;
let auth = client.login(&email, &code_from_user)?;
client.download(&target, &auth, std::path::Path::new("selected-app.apk"))?;
```

To select a request profile, use `PicoStoreClient::with_config(HttpTransport, StoreConfig { device_name: "YOUR_DEVICE".into(), language: "en".into(), zone: "Europe/London".into(), web_region: "uk".into(), ..StoreConfig::default() })`. `StoreConfig` also contains `store_host`, `account_host`, `web_store_host`, `manifest_version_code`, `app_id`, `client_type`, `passport_aid`, and `device_platform`. The default is the observed A9210/Japanese-language overseas-store profile. Any exact `StoreTarget` from search can be selected. `download()` confirms ownership, acquires an available free offer if needed, and then requests download metadata; purchase paid offers on the official store.

Your UI supplies `email` and `code_from_user`. For a command-line app, use the [Python CLI](https://github.com/nkanf-dev/pico-store-lab/tree/main/packages/python).
