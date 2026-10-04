import { createHash, randomUUID } from 'node:crypto';
import { access, link, mkdir, open, unlink, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  type DownloadInfo, type PicoAuth, type PublicItem, type RequestSpec,
  type SearchResults, type StoreTarget, type StoreOptions, makeAccountRequest,
  makeDownloadInfoRequest, makePublicItemRequest, makeSearchRequest, makeAccountItemRequest,
  makeFreeAcquisitionRequest, parseFreeAcquisition,
  parseDownloadInfo, parseOfficialJson, parsePublicItem, parseSearchResults,
} from './pico.js';

export interface StoreResponse { data: unknown; headers: Headers }
export type Transport = (request: RequestSpec, retries: number) => Promise<StoreResponse>;

export async function sendRequest(request: RequestSpec, retries = 3): Promise<StoreResponse> {
  if (retries < 1) throw new Error('at least one request attempt required');
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(request.url, {
        method: request.method, headers: request.headers, body: request.body,
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429) throw new Error(`PICO HTTP ${response.status}`);
        lastError = new Error(`PICO HTTP ${response.status}`);
      } else {
        const body = await response.text();
        if (body.length > 4 * 1024 * 1024) throw new Error('PICO response exceeds 4 MiB');
        return { data: parseOfficialJson(body), headers: response.headers };
      }
    } catch (error) {
      if (error instanceof Error && /^PICO HTTP 4(?!29)/.test(error.message)) throw error;
      lastError = error;
    }
    if (attempt + 1 < retries) await new Promise(resolve => setTimeout(resolve, Math.min(attempt + 1, 5) * 1000));
  }
  throw new Error(`PICO request failed: ${String(lastError)}`);
}

function accountData(response: StoreResponse): Record<string, unknown> {
  const root = response.data as Record<string, unknown>;
  if (!root || root.message !== 'success') throw new Error('PICO account request rejected');
  return root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {};
}

export class PicoStoreClient {
  constructor(readonly options: StoreOptions = {}, readonly transport: Transport = sendRequest) {}

  async search(word: string, nextId = 1): Promise<SearchResults> {
    return parseSearchResults((await this.transport(makeSearchRequest(word, this.options, nextId), 3)).data);
  }

  async item(target: StoreTarget, auth?: PicoAuth): Promise<PublicItem> {
    const request = auth ? makeAccountItemRequest(auth, this.options, target) : makePublicItemRequest(this.options, target);
    return parsePublicItem((await this.transport(request, 3)).data, target, this.options);
  }

  async acquireFree(item: PublicItem, auth: PicoAuth): Promise<string> {
    return parseFreeAcquisition((await this.transport(makeFreeAcquisitionRequest(auth, item, this.options), 1)).data);
  }

  async ensureEntitlement(target: StoreTarget, auth: PicoAuth): Promise<PublicItem> {
    const current = await this.item(target, auth);
    if (current.entitlementStatus === 1) return current;
    if (current.offerExists !== true) throw new Error('PICO has no offer for this account region');
    if (!/^0(?:\.0+)?$/.test(current.price)) throw new Error('PICO app is not free or already owned');
    let acquisitionError: unknown;
    try { await this.acquireFree(current, auth); } catch (error) { acquisitionError = error; }
    for (let attempt = 0; attempt < 3; attempt++) {
      let updated: PublicItem;
      try { updated = await this.item(target, auth); }
      catch (error) {
        if (attempt === 2) throw acquisitionError ?? error;
        await new Promise(resolve => setTimeout(resolve, 400));
        continue;
      }
      if (updated.entitlementStatus === 1) return updated;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (acquisitionError) throw acquisitionError;
    throw new Error('PICO entitlement was not confirmed after free acquisition');
  }

  async sendCode(email: string): Promise<void> {
    accountData(await this.transport(makeAccountRequest('send-code', email, undefined, this.options), 1));
  }

  async login(email: string, code: string): Promise<PicoAuth> {
    const response = await this.transport(makeAccountRequest('login', email, code, this.options), 1);
    const data = accountData(response);
    const cookies: Record<string, string> = {};
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';', 1);
      const separator = pair?.indexOf('=') ?? -1;
      if (separator > 0) cookies[pair!.slice(0, separator)] = pair!.slice(separator + 1);
    }
    const auth: PicoAuth = {
      uid: String(data.user_id_str ?? data.user_id ?? '0'),
      x_tt_token: response.headers.get('x-tt-token') ?? '', cookies,
    };
    if (!auth.x_tt_token && !Object.keys(cookies).length) throw new Error('PICO login returned no usable session');
    return auth;
  }

  async downloadInfo(target: StoreTarget, auth: PicoAuth): Promise<DownloadInfo> {
    return parseDownloadInfo((await this.transport(makeDownloadInfoRequest(auth, this.options, target), 3)).data, target);
  }

  async download(target: StoreTarget, auth: PicoAuth, output: string): Promise<string> {
    await this.ensureEntitlement(target, auth);
    return downloadVerifiedApk(await this.downloadInfo(target, auth), output);
  }
}

export async function downloadVerifiedApk(info: DownloadInfo, output: string, retries = 8): Promise<string> {
  if (!output.endsWith('.apk') || retries < 1) throw new Error('new .apk output path required');
  if (!info.url.startsWith('https://')) throw new Error('HTTPS APK URL required');
  try { await access(output); throw new Error('output APK already exists'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(dirname(output), { recursive: true });
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const temporary = join(dirname(output), `${basename(output)}.${randomUUID()}.part`);
    let file: FileHandle | undefined;
    try {
      const response = await fetch(info.url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok || !response.body) throw new Error(`APK HTTP ${response.status}`);
      file = await open(temporary, 'wx');
      await pipeline(Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
        file.createWriteStream());
      file = await open(temporary, 'r');
      const digest = createHash('md5');
      const buffer = Buffer.alloc(65_536);
      let position = 0;
      while (true) {
        const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) break;
        digest.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
      if (digest.digest('hex') !== info.md5) throw new Error('APK digest mismatch');
      await link(temporary, output);
      return output;
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code === 'EEXIST' ||
          error instanceof Error && error.message === 'APK digest mismatch') throw error;
      if (attempt + 1 < retries) await new Promise(resolve => setTimeout(resolve, Math.min(attempt + 1, 5) * 1000));
    } finally {
      if (file) {
        await file.close().catch(() => {});
        await unlink(temporary).catch(() => {});
      }
    }
  }
  throw new Error(`APK download failed: ${String(lastError)}`);
}
