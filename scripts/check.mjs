import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { createHash } from 'node:crypto';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const catalog = JSON.parse(await readFile('data/api-catalog.json', 'utf8'));
const upstream = parse(await readFile('data/openapi-v0.82.0.yml', 'utf8'));
let count = 0;
for (const [path, methods] of Object.entries(upstream.paths)) {
  for (const method of Object.keys(methods)) {
    if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
    count++;
    assert.ok(catalog.operations.some(op => op.id === method.toUpperCase() + ' ' + path));
  }
}
assert.equal(catalog.operations.length, count);
assert.equal(new Set(catalog.operations.map(op => op.id)).size, count);
const manifests = [
  ['plugins/codex/plugin.json', 'plugins/codex/mcp.json', '${PLUGIN_ROOT}'],
  ['plugins/claude/.claude-plugin/plugin.json', 'plugins/claude/.mcp.json', '${CLAUDE_PLUGIN_ROOT}'],
  ['plugins/grokbot/.cursor-plugin/plugin.json', 'plugins/grokbot/mcp.json', '${CURSOR_PLUGIN_ROOT}'],
];
for (const [manifest, config, root] of manifests) {
  const metadata = JSON.parse(await readFile(manifest, 'utf8'));
  assert.equal(metadata.version, pkg.version);
  assert.equal(metadata.name, 'netbird-admin');
  const server = JSON.parse(await readFile(config, 'utf8')).mcpServers.netbird;
  assert.equal(server.command, 'node');
  assert.equal(server.args[0], root + '/dist/server.mjs');
}
const forbidden = /(?:gh[pousr]_[A-Za-z0-9]{25,}|nbp_[A-Za-z0-9_-]{25,})/;
async function inspect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    assert.ok(!/\.(dpapi|enc\.json|local\.json)$/.test(entry.name), 'Private file in public tree');
    const text = await readFile(file, 'utf8');
    const upstreamFixture = entry.name === 'openapi-v0.82.0.yml' &&
      createHash('sha256').update(await readFile(file)).digest('hex') === 'ed8792e57130fb81abbf9ca16efff785edad7cd9d662efcbc83f21cc43d5199a';
    assert.ok(upstreamFixture || !forbidden.test(text), 'Potential private data in ' + file);
  }
}
for (const path of ['src', 'scripts', 'test', 'data', 'docs', 'plugins', 'dist', 'assets']) await inspect(path);
console.log('Catalog parity, platform manifests and private-data scan passed.');
