// Incremental MD5 for browser-side APK verification.
//
// The Worker cannot hash a multi-hundred-megabyte stream before the body is
// sent, and WebCrypto has no MD5, so the checksum PICO publishes is verified
// where the bytes land. This is a checksum aid, not a security primitive:
// nothing here authenticates the download.

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const SINES = new Uint32Array(64);
for (let index = 0; index < 64; index++) {
  SINES[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296);
}

function transform(state, bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 64);
  const [initialA, initialB, initialC, initialD] = state;
  let a = initialA;
  let b = initialB;
  let c = initialC;
  let d = initialD;
  for (let index = 0; index < 64; index++) {
    let mixed;
    let word;
    if (index < 16) {
      mixed = (b & c) | (~b & d);
      word = index;
    } else if (index < 32) {
      mixed = (d & b) | (~d & c);
      word = (5 * index + 1) % 16;
    } else if (index < 48) {
      mixed = b ^ c ^ d;
      word = (3 * index + 5) % 16;
    } else {
      mixed = c ^ (b | ~d);
      word = (7 * index) % 16;
    }
    const rotate = (a + mixed + SINES[index] + view.getUint32(word * 4, true)) | 0;
    const shift = SHIFTS[index];
    const next = (b + ((rotate << shift) | (rotate >>> (32 - shift)))) | 0;
    a = d; d = c; c = b; b = next;
  }
  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
}

export class Md5 {
  constructor() {
    this.state = new Int32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
    this.block = new Uint8Array(64);
    this.blockLength = 0;
    this.length = 0;
  }

  update(chunk) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    this.length += bytes.length;
    let offset = 0;
    if (this.blockLength > 0) {
      const take = Math.min(64 - this.blockLength, bytes.length);
      this.block.set(bytes.subarray(0, take), this.blockLength);
      this.blockLength += take;
      offset = take;
      if (this.blockLength === 64) {
        transform(this.state, this.block, 0);
        this.blockLength = 0;
      }
    }
    for (; offset + 64 <= bytes.length; offset += 64) transform(this.state, bytes, offset);
    if (offset < bytes.length) {
      this.block.set(bytes.subarray(offset), 0);
      this.blockLength = bytes.length - offset;
    }
    return this;
  }

  // Non-destructive: hashing the padding into a copy leaves the instance usable
  // for repeated reads of the same digest.
  hex() {
    const state = Int32Array.from(this.state);
    const tailLength = ((this.blockLength + 8) >> 6) * 64 + 64;
    const tail = new Uint8Array(tailLength);
    tail.set(this.block.subarray(0, this.blockLength), 0);
    tail[this.blockLength] = 0x80;
    const view = new DataView(tail.buffer);
    view.setUint32(tailLength - 8, (this.length * 8) % 4294967296, true);
    view.setUint32(tailLength - 4, Math.floor(this.length / 536870912), true);
    for (let offset = 0; offset < tailLength; offset += 64) transform(state, tail, offset);
    let digest = '';
    for (const word of state) {
      for (let index = 0; index < 4; index++) {
        digest += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, '0');
      }
    }
    return digest;
  }
}

export function md5Hex(bytes) {
  return new Md5().update(bytes).hex();
}

const CHUNK_BYTES = 4 * 1024 * 1024;

// Reads a File in slices so verifying a large APK never buffers the whole file.
export async function md5File(file, onProgress) {
  const hasher = new Md5();
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    const slice = await file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size)).arrayBuffer();
    hasher.update(new Uint8Array(slice));
    onProgress?.(Math.min(offset + CHUNK_BYTES, file.size) / file.size, file.size);
  }
  return hasher.hex();
}
