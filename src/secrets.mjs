import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, accessSync, constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID, randomBytes, createCipheriv } from 'node:crypto';

const sensitiveName = /password|secret|credential|authorization|private.?key|(?:^|[_-])(?:token|key)$|^(invite_link|invite_url|upload_url)$/i;
const localSecrets = new Set();
export function redact(value, name = '') {
  const publicKey = /^(?:wg_pub_key|ssh_pub_key|public_key)$/.test(name);
  if (!publicKey && sensitiveName.test(name) && value !== null && value !== '') return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, key)]));
  if (typeof value === 'string') {
    let text = value.replace(/nbp_[A-Za-z0-9_-]+/g, '[REDACTED]');
    const pat = process.env.NETBIRD_PAT;
    if (pat) text = text.split(pat).join('[REDACTED]');
    for (const secret of localSecrets) text = text.split(secret).join('[REDACTED]');
    return text.replace(/([?&](?:token|key|secret|code|password)=)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@')
      .replace(/https?:\/\/[^\s"]*(?:\/session\/|\/invite\/)[^\s"]+/gi, '[REDACTED]');
  }
  return value;
}

function encryptWindows(text) {
  const command = [
    '$ErrorActionPreference = "Stop"',
    'Import-Module (Join-Path $PSHOME "Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1")',
    '$s = ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force',
    'try { [Console]::Write(($s | ConvertFrom-SecureString)) } finally { $s.Dispose() }',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
    input: text, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout) throw new Error('Windows secret encryption failed.');
  return result.stdout;
}

export function prepareSecretStore() {
  if (!process.env.NETBIRD_SECRET_DIR) throw new Error('Configure NETBIRD_SECRET_DIR for encrypted API results before applying changes.');
  if (!process.env.NETBIRD_VAULT_KEY && process.platform !== 'win32') {
    throw new Error('Configure a 32-byte base64 NETBIRD_VAULT_KEY for encrypted storage on this platform.');
  }
  const directory = resolve(process.env.NETBIRD_SECRET_DIR);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  accessSync(directory, constants.W_OK);
  if (process.env.NETBIRD_VAULT_KEY) vaultKey();
  else encryptWindows('storage-readiness-check');
  return directory;
}

function vaultKey() {
  const encoded = process.env.NETBIRD_VAULT_KEY ?? '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('NETBIRD_VAULT_KEY must be exactly 32 random bytes encoded in canonical base64.');
  }
  return key;
}

function encryptPortable(text) {
  const key = vaultKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('netbird-admin-response:v1'));
  try {
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return JSON.stringify({
      version: 1, algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
      ciphertext: encrypted.toString('base64'),
    });
  } finally { key.fill(0); }
}

export function protectResult(value) {
  const data = redact(value);
  if (JSON.stringify(data) === JSON.stringify(value)) return data;
  const directory = prepareSecretStore();
  const portable = !!process.env.NETBIRD_VAULT_KEY;
  const file = join(directory, randomUUID() + (portable ? '.enc.json' : '.dpapi'));
  const encrypted = portable ? encryptPortable(JSON.stringify(value)) : encryptWindows(JSON.stringify(value));
  writeFileSync(file, encrypted, { flag: 'wx', mode: 0o600 });
  return { data, encrypted_response_file: file, note: 'Sensitive response values are encrypted locally. Retrieve them outside chat using the configured vault key or Windows account.' };
}

export function resolveSecrets(value) {
  if (Array.isArray(value)) return value.map(resolveSecrets);
  if (!value || typeof value !== 'object') return value;
  if (Object.hasOwn(value, '$secret_env')) {
    if (Object.keys(value).length !== 1 || !/^[A-Z][A-Z0-9_]{0,100}$/.test(value.$secret_env) ||
        ['NETBIRD_PAT', 'NETBIRD_VAULT_KEY'].includes(value.$secret_env) || !process.env[value.$secret_env]) {
      throw new Error('Invalid or unavailable local secret environment reference.');
    }
    const secret = process.env[value.$secret_env];
    localSecrets.add(secret);
    return secret;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSecrets(item)]));
}
