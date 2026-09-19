/**
 * Кодек ключей (ADR-005, п. 4). В базе ключи — `uuid`; фикстуры, адреса экранов, персоны
 * и сессии пользуются читаемыми ключами (`p-korona`). Читаемый ключ превращается
 * в детерминированный `uuid` (SHA-1, версия 5), обратное соответствие строится из известных ключей.
 * Ключи новых записей — сразу `uuid`, их кодек пропускает как есть.
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface KeyCodec {
  encode: (key: string) => string;
  decode: (id: string) => string;
}

/** Детерминированный `uuid` читаемого ключа — тот же, что у `scripts/fixtures-sql.ts` */
export function keyUuid(key: string) {
  const hex = sha1Hex(key);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function createKeyCodec(keys: Iterable<string>): KeyCodec {
  const byUuid = new Map<string, string>();
  for (const key of keys) if (!UUID.test(key)) byUuid.set(keyUuid(key), key);
  return {
    encode: (key) => (UUID.test(key) ? key.toLowerCase() : keyUuid(key)),
    decode: (id) => byUuid.get(id) ?? id,
  };
}

/**
 * SHA-1 без зависимостей: кодек работает и в Node, и в Workers, где `node:crypto` может
 * не быть, а `crypto.subtle` только асинхронный. Сверен с `node:crypto` в тесте.
 */
function sha1Hex(text: string) {
  const bytes = new TextEncoder().encode(text);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1);
    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const temp = (rotl(a, 5) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = temp;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
  }
  return h.map((part) => part.toString(16).padStart(8, "0")).join("");
}
