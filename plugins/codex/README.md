# NetBird Admin

Community plugin by gregboero. Not affiliated with NetBird, OpenAI, Anthropic or xAI.

Use the MCP to discover 231 documented NetBird 0.82.0 operations, inspect schemas, read resources and preview every change before applying it.

Read the complete setup, platform support and security documentation in the [source repository](https://github.com/gregboero/netbird-admin-mcp).

Configure the NetBird HTTPS origin and PAT outside conversations. The token stays local to the MCP runtime. Generated credentials are saved as encrypted local response files. Windows can use DPAPI. Other operating systems require a separate 32-byte base64 NETBIRD_VAULT_KEY.

Every mutation requires a preview. Show the preview to the user and obtain their approval before applying it. Plans expire after five minutes and cannot be reused. This workflow relies on the host assistant following the approval instructions. A preview is not an independent human approval screen. The pre-write state check is not an atomic transaction.

The MCP must run somewhere that can reach the chosen NetBird instance. Private instances may require NetBird connectivity on that runtime. Codex and Claude Code use local stdio. Grok Bot application support must be verified through its plugin review and an in-app test.
