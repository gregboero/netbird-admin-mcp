import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const base = {
  name: 'netbird-admin', version: pkg.version,
  description: 'Community NetBird API administration with validated requests and approved previews.',
  author: { name: 'gregboero' },
  homepage: 'https://github.com/gregboero/netbird-admin-mcp',
  repository: 'https://github.com/gregboero/netbird-admin-mcp',
  license: 'MIT', keywords: ['netbird', 'network', 'vpn', 'administration', 'mcp'],
};
const json = async (path, data) => {
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
};
for (const platform of ['codex', 'claude', 'grokbot']) {
  const root = 'plugins/' + platform;
  await mkdir(root, { recursive: true });
  for (const folder of ['dist', 'data', 'skills', 'assets']) await cp(folder, root + '/' + folder, { recursive: true });
  for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.txt']) await cp(file, root + '/' + file);
  await cp('docs/PLUGIN-README.md', root + '/README.md');
  let config;
  if (platform === 'codex') {
    await json(root + '/plugin.json', {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...base,
      extensions: { 'com.openai': { requires_local_executor: true } },
    });
    config = { mcpServers: { netbird: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/dist/server.mjs'], cwd: '${PLUGIN_ROOT}' } } };
    await json(root + '/mcp.json', { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', ...config });
  } else if (platform === 'claude') {
    await json(root + '/.claude-plugin/plugin.json', base);
    config = { mcpServers: { netbird: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/dist/server.mjs'] } } };
    await json(root + '/.mcp.json', config);
  } else {
    const properties = {
      NETBIRD_URL: { type: 'string', title: 'NetBird HTTPS origin', description: 'Your NetBird origin without /api.' },
      NETBIRD_PAT: { type: 'string', title: 'NetBird API token', description: 'Configure through the platform secret settings.' },
      NETBIRD_SECRET_DIR: { type: 'string', title: 'Private response directory', description: 'A writable private directory on the MCP runtime.' },
      NETBIRD_VAULT_KEY: { type: 'string', title: 'Response encryption key', description: '32 random bytes in base64. Keep in platform secret settings.' },
    };
    await json(root + '/.cursor-plugin/plugin.json', { ...base, logo: 'assets/logo.svg',
      variables: { type: 'object', properties, required: Object.keys(properties) } });
    config = { mcpServers: { netbird: { command: 'node', args: ['${CURSOR_PLUGIN_ROOT}/dist/server.mjs'],
      env: Object.fromEntries(Object.keys(properties).map(key => [key, '${' + key + '}'])) } } };
    await json(root + '/mcp.json', config);
  }
}
await json('.agents/plugins/marketplace.json', {
  name: 'gregboero-netbird', interface: { displayName: 'gregboero NetBird' },
  plugins: [{ name: base.name, source: { source: 'local', path: './plugins/codex' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
});
await json('.claude-plugin/marketplace.json', {
  name: 'gregboero-netbird', owner: { name: 'gregboero' },
  metadata: { description: 'Community NetBird API administration with reviewed changes.' },
  plugins: [{ name: base.name, source: './plugins/claude', description: base.description, version: pkg.version }],
});
await json('.cursor-plugin/marketplace.json', {
  name: 'gregboero-netbird', owner: { name: 'gregboero' },
  plugins: [{ name: base.name, source: 'plugins/grokbot', description: base.description, version: pkg.version }],
});
console.log('Built Codex, Claude Code and Grok Bot/Cursor packages with separate manifests.');
