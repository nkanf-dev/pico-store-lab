import { DeliveryError } from './delivery-error.js';

export function requestedRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header ?? '');
  if (!match || (!match[1] && !match[2])) return null;
  const first = Number(match[1]), last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  if (!match[1]) return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null;
  const end = match[2] ? Math.min(last, size - 1) : size - 1;
  return first < size && first <= end ? { start: first, end } : null;
}

// Metadata may lag a rollout. Validate a resume against the CDN's actual total,
// never against the store's earlier version/size. Invalid resumes get a full fetch.
export function responseLength(upstream, rangeHeader) {
  if (upstream.status !== 206) return upstream.headers.get('content-length');
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(upstream.headers.get('content-range') ?? '');
  if (!match) throw new DeliveryError('apk_range_invalid', 502);
  const [start, end, total] = match.slice(1).map(Number);
  const requested = requestedRange(rangeHeader, total);
  if (![start, end, total].every(Number.isSafeInteger) || !requested ||
      start !== requested.start || end !== requested.end)
    throw new DeliveryError('apk_range_invalid', 502);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== end - start + 1))
    throw new DeliveryError('apk_range_invalid', 502);
  return String(end - start + 1);
}
