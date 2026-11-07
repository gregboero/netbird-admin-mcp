import { appendFileSync } from 'node:fs';
let group = { id: 'mock-id', name: 'Original', peers: [], resources: [] };
globalThis.fetch = async (url, options) => {
  url = new URL(url);
  const method = options.method;
  appendFileSync(process.env.MOCK_LOG, JSON.stringify({ method, path: url.pathname, query: url.search }) + '\n');
  if (url.hostname !== 'example.test') throw Error('Unexpected origin');
  const path = url.pathname;
  if (method === 'GET') {
    if (path === '/api/groups') return Response.json([group]);
    if (path === '/api/groups/mock-id') return group ? Response.json(group) : Response.json({}, { status: 404 });
    if (path === '/api/instance/version') {
      const now = Date.now();
      Date.now = () => now + 360000;
      return Response.json({ version: 'mock' });
    }
    if (path.endsWith('/csv')) return new Response('id,total\n1,2', { headers: { 'content-type': 'text/csv' } });
    if (path.startsWith('/api/identity-providers')) return Response.json({}, { status: 404 });
    return Response.json([]);
  }
  if (path === '/api/groups/mock-id' && method === 'PUT') {
    group = { ...JSON.parse(options.body), id: 'mock-id' };
    return Response.json(group);
  }
  if (path === '/api/groups/mock-id' && method === 'DELETE') {
    group = null;
    return new Response(null, { status: 204 });
  }
  if (path === '/api/setup-keys' && method === 'POST') {
    return Response.json({ id: 'new-key', key: 'SYNTHETIC-SECRET-DO-NOT-RETURN' });
  }
  return Response.json({ ok: true });
};
