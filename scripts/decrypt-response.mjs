import { readFileSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
const path = process.argv[2];
if (!path || !process.env.NETBIRD_VAULT_KEY) throw new Error('Supply a response file and set NETBIRD_VAULT_KEY in this local terminal.');
const data = JSON.parse(readFileSync(path, 'utf8'));
if (data.version !== 1 || data.algorithm !== 'aes-256-gcm') throw new Error('Unsupported encrypted response format.');
const key = Buffer.from(process.env.NETBIRD_VAULT_KEY, 'base64');
if (key.length !== 32) throw new Error('Invalid vault key.');
try {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'base64'));
  decipher.setAAD(Buffer.from('netbird-admin-response:v1'));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  const text = Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  console.log(text);
} finally { key.fill(0); }
