// Auth0 helpers: verify the user's access token, and read/write their app_metadata
// through the Management API using the server's machine-to-machine credentials.
// app_metadata can only be written by the server, never by the user.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const env = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
};

let jwks = null;

/** Express middleware: requires a valid Auth0 access token for our API. Sets req.userId. */
export async function requireUser(req, res, next) {
  try {
    const domain = env('AUTH0_DOMAIN');
    jwks ??= createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) return res.status(401).json({ code: 'unauthorized', message: 'Not logged in.' });
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${domain}/`,
      audience: env('AUTH0_AUDIENCE'),
    });
    if (!payload.sub) throw new Error('Token has no subject');
    req.userId = payload.sub;
    next();
  } catch (err) {
    console.warn('Auth failed:', err.message);
    res.status(401).json({ code: 'unauthorized', message: 'Your session is invalid. Please log in again.' });
  }
}

let mgmt = { token: null, expires: 0 };

async function mgmtToken() {
  if (mgmt.token && Date.now() < mgmt.expires) return mgmt.token;
  const domain = env('AUTH0_DOMAIN');
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env('AUTH0_MGMT_CLIENT_ID'),
      client_secret: env('AUTH0_MGMT_CLIENT_SECRET'),
      audience: `https://${domain}/api/v2/`,
    }),
  });
  if (!res.ok) throw new Error(`Management token request failed (${res.status})`);
  const body = await res.json();
  mgmt = { token: body.access_token, expires: Date.now() + (body.expires_in - 60) * 1000 };
  return mgmt.token;
}

async function mgmtFetch(path, init = {}) {
  const res = await fetch(`https://${env('AUTH0_DOMAIN')}/api/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await mgmtToken()}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`Management API ${init.method ?? 'GET'} ${path.split('?')[0]} failed (${res.status})`);
  return res.json();
}

export async function getAppMetadata(userId) {
  const user = await mgmtFetch(`/users/${encodeURIComponent(userId)}?fields=app_metadata&include_fields=true`);
  return user.app_metadata ?? {};
}

/** Returns the user_ids of accounts already linked to this card hash. */
export async function findUsersByCardHash(hash) {
  const q = encodeURIComponent(`app_metadata.health_card.hash:"${hash}"`);
  const users = await mgmtFetch(`/users?q=${q}&search_engine=v3&fields=user_id&include_fields=true`);
  return users.map((u) => u.user_id);
}

/** The Auth0 user ids for an email address (one per login method, e.g. password and Google). */
export async function findUserIdsByEmail(email) {
  const users = await mgmtFetch(`/users-by-email?email=${encodeURIComponent(email)}&fields=user_id&include_fields=true`);
  return users.map((u) => u.user_id);
}

export async function setHealthCard(userId, healthCard) {
  await mgmtFetch(`/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ app_metadata: { health_card: healthCard } }),
  });
}
