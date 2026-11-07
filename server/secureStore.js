// Encryption and hashing for health numbers. Keys live only in server env vars.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

function key(name) {
  const raw = process.env[name];
  const buf = raw ? Buffer.from(raw, 'base64') : null;
  if (!buf || buf.length !== 32) throw new Error(`${name} must be a base64-encoded 32-byte key`);
  return buf;
}

/** AES-256-GCM. Output: "v1:" + base64(iv | authTag | ciphertext). */
export function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key('HEALTH_CARD_ENC_KEY'), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decrypt(payload) {
  if (!payload.startsWith('v1:')) throw new Error('Unknown ciphertext version');
  const buf = Buffer.from(payload.slice(3), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key('HEALTH_CARD_ENC_KEY'), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

/** Keyed one-way hash, used to stop the same card being linked to two accounts. */
export function cardHash(province, number) {
  return createHmac('sha256', key('HEALTH_CARD_HASH_KEY')).update(`${province}:${number}`).digest('hex');
}

export function checkKeys() {
  key('HEALTH_CARD_ENC_KEY');
  key('HEALTH_CARD_HASH_KEY');
}
