import { randomUUID } from 'node:crypto';
import { planChange } from './changes.mjs';
import { search, describe, prepare, makePreview, fingerprint } from './full-api.mjs';
import { redact, protectResult, prepareSecretStore } from './secrets.mjs';
import { compile } from './schema-validator.mjs';

const endpoints = {
  list_peers: ['peers', 'List devices, NetBird addresses and connection status.'],
  list_groups: ['groups', 'List groups used to organize devices.'],
  list_policies: ['policies', 'List access rules and their source and destination groups.'],
  list_networks: ['networks', 'List configured private networks.'],
  list_routes: ['routes', 'List configured network routes.'],
};
const tools = Object.entries(endpoints).map(([name, [, description]]) => ({
  name, description,
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
}));
const plans = new Map();
const object = { type: 'object' };
const idField = { type: 'string', pattern: '^[A-Za-z0-9_-]+$' };
tools.push(
  ...['group', 'policy'].map(kind => ({
    name: 'preview_' + kind,
    description: 'Preview creating or updating a NetBird ' + kind + '. Supply an id to update. No changes are sent.',
    inputSchema: { type: 'object', properties: { id: idField, changes: object }, required: ['changes'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  })),
  {
    name: 'apply_preview',
    description: 'Apply the exact preview only after the user has seen it and explicitly approved it. Preview IDs expire after five minutes.',
    inputSchema: { type: 'object', properties: { preview_id: { type: 'string' } }, required: ['preview_id'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
);
const requestProperties = {
  operation_id: { type: 'string', description: 'Exact ID returned by search_api, e.g. PUT /api/peers/{peerId}.' },
  path_params: object, query: object,
  body: { description: 'Full JSON request body. Local secret placeholders may use {"$secret_env":"VARIABLE_NAME"}.' },
};
tools.push(
  { name: 'search_api', description: 'Search all 231 documented NetBird 0.82.0 API operations. Cloud/commercial features may be unavailable on the target instance.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 }, mutations_only: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'describe_api', description: 'Retrieve official parameter and body schemas before calling a NetBird operation.',
    inputSchema: { type: 'object', properties: { operation_id: requestProperties.operation_id }, required: ['operation_id'], additionalProperties: false } },
  { name: 'read_api', description: 'Execute a catalogued read-only NetBird API operation. Mutations and action endpoints are rejected. Sensitive results are stored locally with Windows encryption.',
    inputSchema: { type: 'object', properties: requestProperties, required: ['operation_id'], additionalProperties: false } },
  { name: 'preview_api', description: 'Preview ANY catalogued NetBird modification, creation, deletion or action. Show this exact preview and obtain user approval before apply_preview.',
    inputSchema: { type: 'object', properties: requestProperties, required: ['operation_id'], additionalProperties: false } },
  { name: 'discard_preview', description: 'Discard a pending preview without sending changes to NetBird.',
    inputSchema: { type: 'object', properties: { preview_id: { type: 'string' } }, required: ['preview_id'], additionalProperties: false } },
);
for (const tool of tools) tool.annotations ??= { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const toolValidators = new Map(tools.map(tool => [tool.name, compile(tool.inputSchema)]));

function content(data, isError = false, publicSchema = false) {
  return { ...(isError ? { isError } : {}), content: [{ type: 'text', text: JSON.stringify(publicSchema ? data : redact(data)) }] };
}

async function api(path, method = 'GET', body, query = {}) {
  const origin = new URL(process.env.NETBIRD_URL ?? '');
  const token = process.env.NETBIRD_PAT;
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash || !token) {
    throw new Error('Set NETBIRD_URL and supply NETBIRD_PAT through a local secret launcher.');
  }
  let response;
  try {
    const url = new URL('/api/' + path, origin);
    for (const [key, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
    response = await fetch(url, {
      method, headers: { Authorization: 'Token ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Unable to reach the NetBird API. Check the address, certificate and network.');
  }
  if (!response.ok) throw new Error('NetBird returned HTTP ' + response.status + '.');
  const text = await response.text();
  if (!text) return null;
  if ((response.headers.get('content-type') ?? '').includes('json')) return JSON.parse(text);
  return { content_type: response.headers.get('content-type'), text };
}

async function call(name, args = {}) {
  try {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object.');
    if (!toolValidators.has(name)) throw new Error('Unknown tool.');
    toolValidators.get(name)(args);
    if (Object.hasOwn(endpoints, name) && !Object.keys(args).length) return content(protectResult(await api(endpoints[name][0])));
    const now = Date.now();
    for (const [id, plan] of plans) if (plan.expires <= now) plans.delete(id);
    if (name === 'search_api') return content(search(args));
    if (name === 'describe_api') return content(describe(args.operation_id), false, true);
    if (name === 'read_api') {
      const request = prepare(args);
      if (request.op.mutation) throw new Error('This operation requires preview_api followed by approved apply_preview.');
      return content(protectResult(await api(request.path, request.op.method, request.body, request.query)));
    }
    if (name === 'discard_preview') return content({ discarded: plans.delete(args.preview_id) });
    if (name === 'preview_api') {
      const plan = await makePreview(api, args);
      const preview_id = randomUUID();
      if (plans.size >= 50) plans.delete(plans.keys().next().value);
      plans.set(preview_id, { ...structuredClone(plan), expires: Date.now() + 300000 });
      return content({ preview_id, target: plan.target, request: plan.display, before: plan.before,
        after: plan.display.body ?? null, warnings: plan.warnings, expires_in_seconds: 300,
        concurrency: plan.guard ? 'State will be checked again. NetBird has no atomic compare-and-set guarantee.' : 'Unavailable for this action.' });
    }
    if (name === 'preview_group' || name === 'preview_policy') {
      const plan = await planChange(api, name === 'preview_group' ? 'groups' : 'policies', args);
      const preview_id = randomUUID();
      if (plans.size >= 50) plans.delete(plans.keys().next().value);
      plans.set(preview_id, { ...structuredClone(plan), expires: Date.now() + 300000 });
      return content({ preview_id, target: process.env.NETBIRD_URL, before: plan.before, after: plan.after, warnings: plan.warnings });
    }
    if (name === 'apply_preview') {
      const plan = plans.get(args.preview_id);
      if (!plan) throw new Error('Preview expired or already used. Generate a new preview.');
      if (plan.target && plan.target !== process.env.NETBIRD_URL) throw new Error('Target changed. Generate a new preview.');
      prepareSecretStore();
      if (plan.expires <= Date.now()) throw new Error('Preview expired. Generate a new preview.');
      plans.delete(args.preview_id);
      if ((plan.guardPath && JSON.stringify(await api(plan.guardPath)) !== plan.snapshot) ||
          (plan.guard && fingerprint(await api(plan.guard.path, 'GET', undefined, plan.guard.query)) !== plan.guard.hash)) {
        throw new Error('NetBird changed since the preview. Generate a new preview.');
      }
      if (plan.expires <= Date.now()) throw new Error('Preview expired. Generate a new preview.');
      const result = await api(plan.path, plan.method, plan.after, plan.query);
      try {
        return content(protectResult(result));
      } catch {
        throw new Error('The API action succeeded, but saving its sensitive response failed. Do not retry the action. Check the target and local secret storage.');
      }
    }
    throw new Error('Unknown tool or unexpected arguments.');
  } catch (error) {
    return content(error.message, true);
  }
}


export { tools, call };
