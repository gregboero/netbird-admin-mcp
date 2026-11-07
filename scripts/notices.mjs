import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = [];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev || info.optional) continue;
  const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  const files = await readdir(path);
  const file = files.find(name => /^licen[sc]e(?:\.|$)/i.test(name));
  if (!file) throw new Error('Missing dependency license file for ' + pkg.name);
  notices.push(pkg.name + ' ' + pkg.version + '\n' + await readFile(join(path, file), 'utf8'));
}
await writeFile('THIRD-PARTY-NOTICES.txt', notices.join('\n\n') + '\n');
console.log('Recorded ' + notices.length + ' runtime dependency notices.');
