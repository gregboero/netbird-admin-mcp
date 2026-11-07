import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createDecipheriv } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { checkCatalog, prepare, describe, search } from '../src/full-api.mjs';

test('all official request schemas compile and unsafe requests are rejected', () => {
  assert.deepEqual(checkCatalog(), { operations: 231, previewRequired: 135 });
  assert.equal(search({ limit: 100 }).total, 231);
  assert.equal(search({ mutations_only: true }).total, 135);
  assert.ok(describe('POST /api/identity-providers').components.schemas);
  assert.throws(() => prepare({ operation_id: 'GET /api/unknown' }));
  assert.throws(() => prepare({ operation_id: 'GET /api/peers/{peerId}', path_params: { peerId: '../users' } }));
  assert.throws(() => prepare({ operation_id: 'GET /api/peers/{peerId}', path_params: { peerId: '%2f' } }));
  assert.throws(() => prepare({ operation_id: 'GET /api/peers', query: { unexpected: true } }));
  assert.throws(() => prepare({ operation_id: 'PUT /api/groups/{groupId}', path_params: { groupId: 'id' }, body: { name: 3 } }));
});

test('official MCP client verifies reads, previews, mutations, state guards and encrypted output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'netbird-mcp-test-'));
  const log = join(directory, 'network.jsonl');
  const vaultKey = randomBytes(32);
  await writeFile(log, '');
  const client = new Client({ name: 'netbird-admin-contract-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', pathToFileURL(resolve('test/fixtures/mock-api.mjs')).href, resolve('dist/server.mjs')],
    env: { ...process.env, NETBIRD_LOCAL_CONFIG: '', NETBIRD_URL: 'https://example.test',
      NETBIRD_PAT: 'synthetic-test-only', NETBIRD_SECRET_DIR: directory,
      NETBIRD_VAULT_KEY: vaultKey.toString('base64'), MOCK_LOG: log },
    stderr: 'pipe',
  });
  let serverError = '';
  transport.stderr?.on('data', chunk => { serverError += chunk.toString(); });
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { error: !!result.isError, value: JSON.parse(result.content[0].text), raw: JSON.stringify(result) };
  };
  const preview = (operation_id, path_params, body) => call('preview_api', {
    operation_id, path_params, ...(body ? { body } : {}),
  });
  const apply = preview_id => call('apply_preview', { preview_id });
  const mutations = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse).filter(r => r.method !== 'GET').length;
  try {
    try { await client.connect(transport); }
    catch (error) { throw new Error('MCP startup failed: ' + serverError, { cause: error }); }
    assert.equal((await client.listTools()).tools.length, 13);
    assert.equal((await call('search_api')).value.total, 231);
    assert.equal((await call('list_peers')).error, false);
    assert.equal((await call('read_api', { operation_id: 'DELETE /api/groups/{groupId}', path_params: { groupId: 'mock-id' } })).error, true);
    assert.equal((await call('read_api', { operation_id: 'GET /api/reverse-proxies/domains/{domainId}/validate', path_params: { domainId: 'test' } })).error, true);
    const first = await preview('PUT /api/groups/{groupId}', { groupId: 'mock-id' }, { name: 'Updated', peers: [], resources: [] });
    const stale = await preview('PUT /api/groups/{groupId}', { groupId: 'mock-id' }, { name: 'Stale', peers: [] });
    assert.equal(first.error, false);
    assert.equal(first.value.before.name, 'Original');
    assert.equal(await mutations(), 0);
    assert.equal((await call('apply_preview', { preview_id: first.value.preview_id, body: { name: 'Tampered' } })).error, true);
    assert.equal((await apply(first.value.preview_id)).error, false);
    assert.equal((await apply(first.value.preview_id)).error, true);
    assert.equal((await apply(stale.value.preview_id)).error, true);
    assert.equal(await mutations(), 1);
    const create = await preview('POST /api/groups', {}, { name: 'New group', peers: [] });
    assert.equal((await apply(create.value.preview_id)).error, false);
    const deletion = await preview('DELETE /api/groups/{groupId}', { groupId: 'mock-id' });
    assert.equal(deletion.value.after, null);
    assert.equal((await apply(deletion.value.preview_id)).error, false);
    const key = await preview('POST /api/setup-keys', {}, {
      name: 'Test key', type: 'one-off', expires_in: 86400, auto_groups: [], usage_limit: 1,
    });
    assert.equal(key.error, false);
    const issued = await apply(key.value.preview_id);
    assert.equal(issued.error, false);
    assert.ok(!issued.raw.includes('SYNTHETIC-SECRET-DO-NOT-RETURN'));
    const encrypted = JSON.parse(await readFile(issued.value.encrypted_response_file, 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', vaultKey, Buffer.from(encrypted.iv, 'base64'));
    decipher.setAAD(Buffer.from('netbird-admin-response:v1'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()]);
    assert.equal(JSON.parse(decrypted).key, 'SYNTHETIC-SECRET-DO-NOT-RETURN');
    const csv = await call('read_api', { operation_id: 'GET /api/integrations/billing/invoices/{id}/csv', path_params: { id: 'test' } });
    assert.equal(csv.value.text, 'id,total\n1,2');
    assert.equal((await call('read_api', { operation_id: 'GET /api/identity-providers' })).error, true);
    const count = await mutations();
    const cancelled = await preview('POST /api/groups', {}, { name: 'Cancelled', peers: [] });
    assert.equal((await call('discard_preview', { preview_id: cancelled.value.preview_id })).value.discarded, true);
    assert.equal((await apply(cancelled.value.preview_id)).error, true);
    const expired = await preview('POST /api/groups', {}, { name: 'Expired', peers: [] });
    await call('read_api', { operation_id: 'GET /api/instance/version' });
    assert.equal((await apply(expired.value.preview_id)).error, true);
    assert.equal(await mutations(), count);
  } finally {
    await client.close();
    vaultKey.fill(0);
    await rm(directory, { recursive: true, force: true });
  }
});
