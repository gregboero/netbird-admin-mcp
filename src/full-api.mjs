import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compile } from './schema-validator.mjs';
import { redact, resolveSecrets } from './secrets.mjs';

export const catalog = JSON.parse(readFileSync(new URL('../data/api-catalog.json', import.meta.url), 'utf8'));
const operations = new Map(catalog.operations.map(op => [op.id, op]));
const validators = new Map();
const forbiddenSegment = value => /[\/\\%?#\x00-\x1f]/.test(value) || value === '.' || value === '..';
export const canonical = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});
export const fingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');

function operation(id) {
  const op = operations.get(id);
  if (!op) throw new Error('Unknown operation_id. Use search_api and describe_api.');
  return op;
}

export function describe(id) {
  const op = operation(id);
  const needed = {};
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const key = value.$ref.split('/').pop();
      if (!Object.hasOwn(needed, key)) {
        needed[key] = catalog.components.schemas[key];
        collect(needed[key]);
      }
    }
    for (const item of Object.values(value)) if (item && typeof item === 'object') collect(item);
  }
  collect(op.requestSchema);
  return { ...op, components: { schemas: needed }, netbird_version: catalog.netbirdVersion };
}

export function search({ text = '', offset = 0, limit = 25, mutations_only = false } = {}) {
  if (typeof text !== 'string' || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) ||
      limit < 1 || limit > 100 || typeof mutations_only !== 'boolean') throw new Error('Invalid catalog search parameters.');
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = catalog.operations.filter(op => (!mutations_only || op.mutation) &&
    terms.every(term => (op.id + ' ' + op.summary + ' ' + op.tags.join(' ')).toLowerCase().includes(term)));
  return { total: hits.length, offset, operations: hits.slice(offset, offset + limit).map(op => ({
    operation_id: op.id, summary: op.summary, requires_preview: op.mutation, tags: op.tags,
  })), next_offset: offset + limit < hits.length ? offset + limit : null };
}

export function prepare(args) {
  if (!args || typeof args !== 'object' || Object.keys(args).some(key => !['operation_id', 'path_params', 'query', 'body'].includes(key))) {
    throw new Error('Unexpected API request arguments.');
  }
  const op = operation(args.operation_id);
  const input = resolveSecrets({ path_params: args.path_params ?? {}, query: args.query ?? {},
    ...(args.body !== undefined ? { body: args.body } : {}) });
  if (!validators.has(op.id)) {
    validators.set(op.id, compile({ ...op.requestSchema, components: catalog.components }));
  }
  validators.get(op.id)(input);
  let path = op.path.slice('/api/'.length);
  const redactedPath = {};
  for (const [key, value] of Object.entries(input.path_params)) {
    if (!['string', 'number'].includes(typeof value) || forbiddenSegment(String(value))) throw new Error('Invalid path parameter segment.');
    path = path.replace('{' + key + '}', encodeURIComponent(String(value)));
    redactedPath[key] = /^(token|key|secret)$/i.test(key) ? '[REDACTED]' : value;
  }
  if (/[{}]/.test(path)) throw new Error('Missing path parameters.');
  return { op, path, query: input.query, body: input.body,
    display: redact({ operation_id: op.id, path_params: redactedPath, query: input.query, ...(input.body !== undefined ? { body: input.body } : {}) }) };
}

export async function makePreview(api, args) {
  const request = prepare(args);
  if (!request.op.mutation) throw new Error('Use read_api for this read-only operation.');
  const warnings = [
    'Only the exact method, parameters and body shown will be applied.',
    'NetBird API permissions, server version and commercial licensing still apply.',
  ];
  if (request.op.method === 'DELETE') warnings.push('Deletion may be irreversible and can revoke access.');
  if (request.op.method === 'PUT') warnings.push('PUT can replace fields. Include all required state you intend to preserve.');
  let candidate = request.op.path;
  let guard;
  while (candidate.startsWith('/api/')) {
    const op = operations.get('GET ' + candidate);
    if (op && !op.mutation) {
      try {
        const params = Object.fromEntries(Object.entries(args.path_params ?? {}).filter(([key]) => candidate.includes('{' + key + '}')));
        const supported = new Set(op.parameters.filter(p => p.in === 'query').map(p => p.name));
        const query = Object.fromEntries(Object.entries(args.query ?? {}).filter(([key]) => supported.has(key)));
        const read = prepare({ operation_id: op.id, path_params: params, query });
        const before = await api(read.path, 'GET', undefined, read.query);
        guard = { path: read.path, query: read.query, hash: fingerprint(before) };
        return {
          path: request.path, method: request.op.method, query: request.query, after: request.body,
          guard, before: redact(before), display: request.display, warnings,
          target: process.env.NETBIRD_URL, operation_id: request.op.id,
        };
      } catch (error) {
        if (!/^NetBird returned HTTP (404|405)\./.test(error.message)) throw error;
      }
    }
    candidate = candidate.slice(0, candidate.lastIndexOf('/'));
  }
  warnings.push('No readable pre-change state is available for this action. Concurrent changes cannot be checked.');
  return {
    path: request.path, method: request.op.method, query: request.query, after: request.body,
    before: null, display: request.display, warnings,
    target: process.env.NETBIRD_URL, operation_id: request.op.id,
  };
}

export function checkCatalog() {
  for (const op of catalog.operations) {
    validators.set(op.id, compile({ ...op.requestSchema, components: catalog.components }));
  }
  return { operations: operations.size, previewRequired: catalog.operations.filter(op => op.mutation).length };
}
