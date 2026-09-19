# PICO Store Lab — Python SDK

PICO app search, sign-in, and downloads for Python, with a `pico-store-py` command-line tool for Windows, macOS, and Linux. This package is part of [PICO Store Lab](https://github.com/nkanf-dev/pico-store-lab).

Install with `python -m pip install pico-store-lab`.

```python
from pathlib import Path
from pico_store_lab import PicoStoreClient, StoreTarget

client = PicoStoreClient()
found = client.search("YouTube VR").items[0]
target = StoreTarget(found.item_id, found.package_name)
client.item(target)
client.send_code(email)
auth = client.login(email, code_from_user)
client.download(target, auth, Path("selected-app.apk"))
```

Configure the request identity and region with `StoreConfig`:

```python
from pico_store_lab import StoreConfig

client = PicoStoreClient(
    config=StoreConfig(
        device_name="YOUR_DEVICE", language="en", zone="Europe/London", web_region="uk"
    )
)
```

Other fields include `store_host`, `account_host`, `web_store_host`, `manifest_version_code`, `app_id`, `client_type`, `passport_aid`, and `device_platform`. The default profile reflects the observed A9210/Japanese-language overseas-store requests. Select any exact `StoreTarget` from search. `download()` confirms ownership, acquires an available free offer if necessary, then gets the APK metadata. Paid offers are purchased on the official store.

`email` and `code_from_user` come from your app's UI. `PicoStoreClient` performs the requests and verified download; pass a custom transport if you need different HTTP behavior. Low-level builders and parsers remain public. Use `pico-store-py --help` for the smaller CLI surface.

The [player guide](https://github.com/nkanf-dev/pico-store-lab#player-guide) gives the complete `search` → `status` → `send-code` → `login` → `download` command sequence, including device installation.
