import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function loadLocalConfig(path) {
  if (process.platform !== 'win32') throw new Error('NETBIRD_LOCAL_CONFIG requires Windows DPAPI.');
  const config = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const command = [
    '$ErrorActionPreference = "Stop"',
    'Import-Module (Join-Path $PSHOME "Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1")',
    '$secure = Get-Content -Raw -LiteralPath $env:NETBIRD_DPAPI_PATH | ConvertTo-SecureString',
    '$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)',
    'try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(command, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...process.env, NETBIRD_DPAPI_PATH: config.tokenFile },
  });
  if (result.status !== 0 || !result.stdout) throw new Error('Unable to read the Windows encrypted NetBird token.');
  process.env.NETBIRD_URL = config.url;
  process.env.NETBIRD_PAT = result.stdout;
  if (config.secretDir) process.env.NETBIRD_SECRET_DIR = config.secretDir;
}
