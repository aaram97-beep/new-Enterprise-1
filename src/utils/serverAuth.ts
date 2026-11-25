import crypto from 'node:crypto';
import type { DatabaseSchema, User, UserSession } from '../types/index.ts';

export const SERVER_SESSION_COOKIE = 'ims_server_session';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let fallbackProcessSecret: string | null = null;

export function getSessionSecret(): string {
  const envSecret = (process.env.IMS_SESSION_SECRET || '').trim();
  if (envSecret.length >= 16) return envSecret;
  if (!fallbackProcessSecret) {
    fallbackProcessSecret = crypto.randomBytes(32).toString('hex');
  }
  return fallbackProcessSecret;
}

export interface SignedSessionPayload {
  uid: string;
  username: string;
  role: 'admin' | 'user';
  exp: number;
}

export interface PublicMeta {
  companyName: string;
  logo: string;
  lang: 'en' | 'ar';
}

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signSessionToken(
  session: UserSession,
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
  nowMs: number = Date.now()
): string {
  const payload: SignedSessionPayload = {
    uid: session.id,
    username: session.username,
    role: session.role,
    exp: nowMs + ttlMs,
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  nowMs: number = Date.now()
): SignedSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<SignedSessionPayload>;
    if (
      typeof parsed.uid !== 'string' ||
      !parsed.uid ||
      typeof parsed.username !== 'string' ||
      (parsed.role !== 'admin' && parsed.role !== 'user') ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= nowMs
    ) {
      return null;
    }
    return {
      uid: parsed.uid,
      username: parsed.username,
      role: parsed.role,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function isHttpsRequest(params: {
  secure?: boolean;
  forwardedProto?: string | string[];
}): boolean {
  if (params.secure) return true;
  const raw = Array.isArray(params.forwardedProto)
    ? params.forwardedProto[0]
    : params.forwardedProto;
  return typeof raw === 'string' && raw.split(',')[0].trim().toLowerCase() === 'https';
}

export function buildSessionCookieHeader(
  token: string,
  opts: { isHttps: boolean; remember?: boolean }
): string {
  const parts = [
    `${SERVER_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
  ];
  if (opts.remember !== false) {
    parts.push(`Max-Age=${Math.floor(DEFAULT_TTL_MS / 1000)}`);
  }
  if (opts.isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function buildClearSessionCookieHeader(isHttps: boolean): string {
  const parts = [
    `${SERVER_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function isValidCsrfRequest(headers: {
  origin?: string;
  host?: string;
  forwardedHost?: string | string[];
  requestedWith?: string | string[];
}): boolean {
  const xrw = Array.isArray(headers.requestedWith)
    ? headers.requestedWith[0]
    : headers.requestedWith;
  if (typeof xrw === 'string' && xrw.trim() === 'IMSClient') {
    return true;
  }

  const origin = headers.origin;
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const fwdHost = Array.isArray(headers.forwardedHost)
      ? headers.forwardedHost[0]
      : headers.forwardedHost;
    const expectedHost = (fwdHost || headers.host || '').split(',')[0].trim().toLowerCase();
    return Boolean(expectedHost && originHost === expectedHost);
  } catch {
    return false;
  }
}

export function extractPublicMeta(db: DatabaseSchema | Record<string, unknown> | null): PublicMeta {
  const settings = (db && typeof db === 'object' ? (db as Record<string, unknown>).settings : null) as
    | Record<string, unknown>
    | null;
  const companyName =
    settings && typeof settings.companyName === 'string' && settings.companyName.trim()
      ? settings.companyName
      : 'A97 Trading Co.';
  const logo = settings && typeof settings.logo === 'string' ? settings.logo : '';
  const lang = settings && settings.lang === 'ar' ? 'ar' : 'en';
  return { companyName, logo, lang };
}

export function verifyUserCredentials(
  users: User[] | unknown,
  username: string,
  password: string
): UserSession | null {
  if (!Array.isArray(users)) return null;
  const targetUser = username.trim().toLowerCase();
  if (!targetUser || !password) return null;

  for (const candidate of users) {
    if (!candidate || typeof candidate !== 'object') continue;
    const u = candidate as User;
    if (!u.active) continue;
    if (String(u.username || '').trim().toLowerCase() !== targetUser) continue;

    const storedBuf = Buffer.from(String(u.pass ?? ''), 'utf8');
    const providedBuf = Buffer.from(password, 'utf8');
    if (storedBuf.length === providedBuf.length && crypto.timingSafeEqual(storedBuf, providedBuf)) {
      return {
        id: u.id,
        name: u.name,
        role: u.role === 'admin' ? 'admin' : 'user',
        username: u.username,
      };
    }
  }
  return null;
}

export function isActiveServerUser(
  db: Record<string, unknown> | null,
  tokenPayload: SignedSessionPayload
): boolean {
  if (!db || !Array.isArray(db.users)) return true;
  const match = (db.users as User[]).find(
    (u) =>
      u &&
      u.id === tokenPayload.uid &&
      String(u.username || '').trim().toLowerCase() === tokenPayload.username.trim().toLowerCase() &&
      u.active === true
  );
  return Boolean(match);
}
