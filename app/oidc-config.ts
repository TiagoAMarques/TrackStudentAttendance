import * as oidc from 'openid-client';

export type OidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  clientAuthMethod: 'client_secret_basic' | 'client_secret_post';
  scopes: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  publicOrigin: string;
  studentIdClaim: string;
  teacherGroupClaim: string | null;
  teacherGroups: Set<string>;
};

let cachedConfiguration: Promise<oidc.Configuration> | null = null;

export function oidcEnabled() { return process.env.AUTH_PROVIDER === 'oidc'; }

export function getOidcSettings(): OidcSettings {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} must be configured when AUTH_PROVIDER=oidc.`);
    return value;
  };
  const publicOrigin = normalizedOrigin(required('PULSE_PUBLIC_ORIGIN'), 'PULSE_PUBLIC_ORIGIN');
  const issuer = normalizedUrl(required('OIDC_ISSUER_URL'), 'OIDC_ISSUER_URL');
  const redirectUri = normalizedUrl(required('OIDC_REDIRECT_URI'), 'OIDC_REDIRECT_URI');
  const postLogoutRedirectUri = normalizedUrl(required('OIDC_POST_LOGOUT_REDIRECT_URI'), 'OIDC_POST_LOGOUT_REDIRECT_URI');
  if (new URL(redirectUri).origin !== publicOrigin || new URL(postLogoutRedirectUri).origin !== publicOrigin) {
    throw new Error('OIDC redirect and post-logout URLs must use PULSE_PUBLIC_ORIGIN.');
  }
  if (new URL(redirectUri).pathname !== '/api/auth/callback/oidc') throw new Error('OIDC_REDIRECT_URI must end in /api/auth/callback/oidc.');
  if (process.env.NODE_ENV === 'production' && (![publicOrigin, issuer, redirectUri, postLogoutRedirectUri].every(value => value.startsWith('https://')))) {
    throw new Error('Production OIDC URLs must use HTTPS.');
  }
  const authMethod = (process.env.OIDC_CLIENT_AUTH_METHOD?.trim() || 'client_secret_basic');
  if (authMethod !== 'client_secret_basic' && authMethod !== 'client_secret_post') throw new Error('OIDC_CLIENT_AUTH_METHOD must be client_secret_basic or client_secret_post.');
  const scopes = process.env.OIDC_SCOPES?.trim() || 'openid profile email';
  if (!scopes.split(/\s+/).includes('openid')) throw new Error('OIDC_SCOPES must include openid.');
  const teacherGroups = new Set((process.env.OIDC_TEACHER_GROUPS ?? '').split(',').map(value => value.trim()).filter(Boolean));
  const teacherGroupClaim = process.env.OIDC_TEACHER_GROUP_CLAIM?.trim() || null;
  if (teacherGroups.size && !teacherGroupClaim) throw new Error('OIDC_TEACHER_GROUP_CLAIM is required when OIDC_TEACHER_GROUPS is configured.');
  const sessionSecret = required('AUTH_SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('AUTH_SESSION_SECRET must contain at least 32 characters.');
  return {
    issuer,
    clientId: required('OIDC_CLIENT_ID'),
    clientSecret: required('OIDC_CLIENT_SECRET'),
    clientAuthMethod: authMethod,
    scopes,
    redirectUri,
    postLogoutRedirectUri,
    publicOrigin,
    studentIdClaim: required('OIDC_STUDENT_ID_CLAIM'),
    teacherGroupClaim,
    teacherGroups,
  };
}

export async function getOidcConfiguration() {
  if (!cachedConfiguration) {
    const settings = getOidcSettings();
    const authentication = settings.clientAuthMethod === 'client_secret_post'
      ? oidc.ClientSecretPost(settings.clientSecret)
      : oidc.ClientSecretBasic(settings.clientSecret);
    cachedConfiguration = oidc.discovery(
      new URL(settings.issuer), settings.clientId,
      { client_secret: settings.clientSecret, redirect_uris: [settings.redirectUri], response_types: ['code'] },
      authentication,
    );
  }
  return cachedConfiguration;
}

export function claimValue(claims: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, claims);
}

export function claimStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(/[;,]/).map(item => item.trim()).filter(Boolean);
}

export function safeReturnPath(value: string | null | undefined): string {
  const candidate = value?.trim() || '/';
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/';
  try {
    const url = new URL(candidate, 'https://pulse.local');
    if (url.origin !== 'https://pulse.local' || url.pathname.startsWith('/api/auth/')) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}

function normalizedUrl(value: string, name: string) {
  try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error(); return value; }
  catch { throw new Error(`${name} must be an absolute HTTP(S) URL.`); }
}

function normalizedOrigin(value: string, name: string) {
  const url = new URL(normalizedUrl(value, name));
  if (url.pathname !== '/' || url.search) throw new Error(`${name} must contain only the public origin.`);
  return url.origin;
}
