import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, call } from './engine.mjs';
import { loadLocalConfig } from './windows-config.mjs';

if (process.env.NETBIRD_LOCAL_CONFIG) loadLocalConfig(process.env.NETBIRD_LOCAL_CONFIG);
const server = new Server({ name: 'netbird-admin', version: '0.4.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async request =>
  call(request.params.name, request.params.arguments ?? {}));
await server.connect(new StdioServerTransport());
