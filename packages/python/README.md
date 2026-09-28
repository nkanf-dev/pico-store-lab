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

Choose the store with `StoreConfig.for_region("global")` (the default) or `StoreConfig.for_region("cn")` for mainland China. China accounts sign in with a phone number and SMS code:

```python
from pico_store_lab import StoreConfig

client = PicoStoreClient(config=StoreConfig.for_region("cn"))
client.send_mobile_code(mobile, country_code="86")
auth = client.login_mobile(mobile, code_from_user, country_code="86")
found = client.search("AeriPane").items[0]
client.download(StoreTarget(found.item_id, found.package_name), auth, Path("AeriPane.apk"))
```

Use the same region throughout search, sign-in, and download. International and China accounts have separate sign-ins and app libraries. The China login method signs in to an existing account; register at [PICO](https://sso.picoxr.com/passport) first if needed. If PICO asks for extra verification or limits code requests, finish its verification or wait before trying again.

The CLI keeps each region's sign-in available independently. Replace `YOUR_PHONE_NUMBER` with your number, without the country code:

```sh
pico-store-py --region cn search AeriPane
pico-store-py --region cn send-code --mobile YOUR_PHONE_NUMBER
pico-store-py --region cn login --mobile YOUR_PHONE_NUMBER
pico-store-py --region cn download --item-id 7680447105202274345 --package com.aeripane.pico --output ./AeriPane.apk
pico-store-py --region cn logout
```

Enter the SMS code at the hidden prompt. Use `--country-code` on `send-code` and `login` for a different dialing code. Omit `--region` to use your international account as before. `--locale zh-CN` changes CLI messages; it does not change the store. To select a headset model, use `--device`, for example `pico-store-py --region cn --device B3110 search AeriPane`.

If you prefer to sign in through PICO's official browser page, use `login-window` (alias `login-gui`). It opens the official PICO login page in a dedicated browser window, closes the window automatically after you sign in, verifies the session with the account service, and saves that region's sign-in:

```sh
pico-store-py --region cn login-window
```

Browser discovery checks Edge and Chrome on `PATH`, then platform application registrations, and finally other Chromium-based browsers. It supports Windows, macOS, and Linux XDG desktop entries. To choose a browser yourself, pass its executable path:

```sh
pico-store-py --region cn login-window --browser "/path/to/Chromium Browser"
```

The window uses an isolated temporary browser profile, so your normal browser profile and cookies are never touched. Closing the window before signing in cancels the command. From Python, call `capture_login` and optionally set `browser_path`:

```python
from pico_store_lab import StoreConfig, credentials
from pico_store_lab.browser_login import capture_login

auth = capture_login(StoreConfig.for_region("cn"))
credentials.save(auth)
# Or select one directly:
# auth = capture_login(StoreConfig.for_region("cn"), browser_path="/path/to/chromium")
```

Customize a region's request identity with `dataclasses.replace`:

```python
from dataclasses import replace
from pico_store_lab import StoreConfig

client = PicoStoreClient(
    config=replace(
        StoreConfig.for_region("global"),
        device_name="YOUR_DEVICE", language="en", zone="Europe/London", web_region="uk"
    )
)
```

Other fields include `store_host`, `account_host`, `web_store_host`, `sso_host`, `manifest_version_code`, `app_id`, `client_type`, `passport_aid`, and `device_platform`. The default profile reflects the observed A9210/Japanese-language overseas-store requests. Select any exact `StoreTarget` from search. `download()` confirms ownership, acquires an available free offer if necessary, then gets the APK metadata. Paid offers are purchased on the official store.

`email` and `code_from_user` come from your app's UI. `PicoStoreClient` performs the requests and verified download; pass a custom transport if you need different HTTP behavior. Low-level builders and parsers remain public. Use `pico-store-py --help` for the smaller CLI surface.

The [player guide](https://github.com/nkanf-dev/pico-store-lab#player-guide) gives the complete `search` → `status` → `send-code` → `login` → `download` command sequence, including device installation.
