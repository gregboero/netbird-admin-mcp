import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/server.mjs'], outfile: 'dist/server.mjs', bundle: true,
  platform: 'node', format: 'esm', target: 'node22', legalComments: 'eof',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
