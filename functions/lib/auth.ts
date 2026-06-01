/**
 * 鉴权工具 — 纯 JS 实现，不依赖 Web Crypto
 * 密码哈希: SHA-256 + salt
 * Token: HMAC-SHA256 JWT
 */

// ---- 纯 JS SHA-256 实现 ----

function sha256(message: string): string {
  function rightRotate(v: number, n: number) { return (v >>> n) | (v << (32 - n)); }

  const msg = unescape(encodeURIComponent(message));
  const len = msg.length;
  const bytes: number[] = [];
  for (let i = 0; i < len; i++) bytes.push(msg.charCodeAt(i));

  const bitLen = len * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);

  for (let i = 0; i < 8; i++) {
    bytes.push((bitLen >>> (56 - i * 8)) & 0xff);
  }

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  for (let i = 0; i < bytes.length; i += 64) {
    const W = new Array(64);
    for (let t = 0; t < 16; t++) {
      const idx = i + t * 4;
      W[t] = (bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(W[t - 15], 7) ^ rightRotate(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rightRotate(W[t - 2], 17) ^ rightRotate(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = H;

    for (let t = 0; t < 64; t++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    H = H.map((v, j) => (v + [a, b, c, d, e, f, g, h][j]) | 0);
  }

  return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

// ---- 密码哈希 ----

export async function hashPassword(password: string): Promise<string> {
  const salt = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  const hash = sha256(salt + password);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  return sha256(salt + password) === hash;
}

// ---- JWT ----

const JWT_SECRET = 'cowcat_jwt_secret_2026';

interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

function base64url(str: string): string {
  // btoa for Unicode-safe strings
  const utf8 = unescape(encodeURIComponent(str));
  let b64 = '';
  for (let i = 0; i < utf8.length; i++) {
    b64 += String.fromCharCode(utf8.charCodeAt(i));
  }
  b64 = btoa(b64);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const decoded = atob(str);
  // Convert back from UTF-8
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i));
  }
  return decodeURIComponent(escape(result));
}

export function signToken(type: 'access' | 'refresh'): string {
  const now = Math.floor(Date.now() / 1000);
  const expire = type === 'access' ? 7200 : 604800; // 2h / 7d
  const payload: JWTPayload = { sub: 'admin', iat: now, exp: now + expire, type };
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const toSign = `${headerB64}.${payloadB64}`;
  const signature = sha256(JWT_SECRET + toSign);
  return `${toSign}.${signature}`;
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sig] = parts;
    const expectedSig = sha256(JWT_SECRET + `${headerB64}.${payloadB64}`);
    if (sig !== expectedSig) return null;
    const payload: JWTPayload = JSON.parse(base64urlDecode(payloadB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export async function authenticateRequest(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const payload = verifyToken(authHeader.slice(7));
  return payload !== null && payload.type === 'access';
}
