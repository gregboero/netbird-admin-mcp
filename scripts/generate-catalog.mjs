import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
const spec = parse(await readFile('data/openapi-v0.82.0.yml', 'utf8'));
function deref(value) {
  if (!value?.$ref) return value;
  let node = spec;
  for (const part of value.$ref.slice(2).split('/')) node = node[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  const { $ref, ...rest } = value;
  return { ...node, ...rest };
}
function schema(value) {
  if (Array.isArray(value)) return value.map(schema);
  if (!value || typeof value !== 'object') return value;
  const ignored = new Set(['example', 'xml', 'externalDocs', 'discriminator', 'nullable']);
  const result = Object.fromEntries(Object.entries(value).filter(([key]) => !ignored.has(key)).map(([key, item]) => [key, schema(item)]));
  return value.nullable ? { anyOf: [result, { type: 'null' }] } : result;
}
const operations = [];
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, raw] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
    const op = deref(raw);
    const parameters = [...(methods.parameters ?? []), ...(op.parameters ?? [])].map(deref).map(p => ({ ...p, schema: schema(p.schema ?? {}) }));
    if (parameters.some(p => !['path', 'query'].includes(p.in))) throw new Error('Unhandled parameter location');
    const body = deref(op.requestBody ?? {});
    const media = body.content ?? {};
    if (Object.keys(media).some(type => type !== 'application/json')) throw new Error('Unhandled body media type');
    const properties = {};
    for (const [location, name] of [['path', 'path_params'], ['query', 'query']]) {
      const entries = parameters.filter(p => p.in === location);
      properties[name] = { type: 'object', properties: Object.fromEntries(entries.map(p => [p.name, p.schema])),
        required: entries.filter(p => p.required).map(p => p.name), additionalProperties: false };
    }
    if (media['application/json']) properties.body = schema(media['application/json'].schema ?? {});
    operations.push({
      id: method.toUpperCase() + ' ' + path, method: method.toUpperCase(), path,
      summary: op.summary ?? '', description: op.description ?? '', tags: op.tags ?? [], parameters,
      mutation: !['get', 'head', 'options'].includes(method) || path.endsWith('/validate') || path === '/api/integrations/billing/portal',
      requestSchema: { type: 'object', properties, required: ['path_params', 'query', ...(body.required ? ['body'] : [])], additionalProperties: false },
    });
  }
}
const catalog = { netbirdVersion: '0.82.0',
  source: 'https://github.com/netbirdio/netbird/blob/v0.82.0/shared/management/http/api/openapi.yml',
  components: { schemas: schema(spec.components.schemas) }, operations };
await writeFile('data/api-catalog.json', JSON.stringify(catalog, null, 2) + '\n');
console.log('Generated ' + operations.length + ' documented operations.');
