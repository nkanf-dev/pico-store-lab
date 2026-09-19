# PICO Store Lab — TypeScript SDK

Strictly typed PICO store client, protocol builders, response validators, release transitions, and mirror policy. The SDK powers the Website in this monorepo; the full client uses Node.js for verified file downloads and accepts a custom request transport.

Install with `npm install @nkanf-dev/pico-store-sdk`.

```ts
import { PicoStoreClient } from '@nkanf-dev/pico-store-sdk/client';

const client = new PicoStoreClient();
const target = (await client.search('YouTube VR')).items[0];
await client.item(target);
await client.sendCode(email);
const auth = await client.login(email, codeFromUser);
await client.download(target, auth, './selected-app.apk');
```

Pass a request profile when your device or account region differs from the defaults:

```ts
const client = new PicoStoreClient({ deviceName: 'YOUR_DEVICE', language: 'en',
  zone: 'Europe/London', webRegion: 'uk' });
```

`StoreOptions` also exposes `storeHost`, `accountHost`, `webStoreHost`, `manifestVersionCode`, `appId`, `clientType`, `passportAid`, and `devicePlatform`. Defaults are the observed A9210/Japanese-language overseas-store request profile; a `StoreTarget` from search supplies the app ID and package name. `download()` checks ownership, acquires an available free offer if needed, and only then requests download metadata. Paid offers must be purchased through the official store first.

`email` and `codeFromUser` come from your app's UI. The high-level client performs network requests only when its methods are called. You can inject a transport; the low-level protocol API stays public.

Device installation remains an Android system operation; see the [player guide](https://github.com/nkanf-dev/pico-store-lab#player-guide).
