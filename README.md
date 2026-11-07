# NetBird Admin MCP

Community NetBird administration for **Codex**, **Claude Code**, and **Grok Bot/Cursor plugin review**.

Discover the 231 REST operations documented by NetBird 0.82.0. Read devices, groups, users, policies, routes, DNS and integrations. Preview the exact request before any change, action or deletion.

Independent community project maintained by **gregboero**. No affiliation or endorsement by NetBird, OpenAI, Anthropic or xAI.

## Status

| Client | Distribution | Verification |
|---|---|---|
| Codex desktop | Bundled local MCP and skill | Local MCP tested against a self-hosted instance |
| Claude Code | Native plugin manifest and marketplace | Official CLI validation and MCP client contract tests |
| Grok Bot / Cursor | Dedicated Cursor-compatible manifest | Package prepared; Grok Bot in-app verification and store review still required |

GitHub availability and official-store approval are separate. See [publication status](docs/PUBLISHING.md).

## Install

Node.js 22 or later is required. Plugin packages include the compiled MCP and its dependencies, so installation does not run npm scripts.

### Codex

```sh
codex plugin marketplace add gregboero/netbird-admin-mcp
codex plugin add netbird-admin@gregboero-netbird
```

### Claude Code

```sh
claude plugin marketplace add gregboero/netbird-admin-mcp
claude plugin install netbird-admin@gregboero-netbird
```

Start a new local conversation after installation. Configure credentials in the host environment before launching the client. An existing Windows DPAPI configuration can instead be referenced through NETBIRD_LOCAL_CONFIG.

### Grok Bot / Cursor

The package is in plugins/grokbot. Its manifest declares configuration variables for the NetBird origin, PAT, encrypted-response directory and vault key. Configure secrets in the platform's secure settings. The MCP runtime must be able to reach the chosen NetBird instance.

Grok Bot installation and in-app execution are subject to its marketplace loader and review. A local Codex test does not establish Grok Bot compatibility. No production MCP endpoint is operated by this repository.

## Configuration

| Variable | Purpose |
|---|---|
| NETBIRD_URL | HTTPS origin of your instance, without /api |
| NETBIRD_PAT | NetBird API personal access token, with the permissions you intend to grant |
| NETBIRD_SECRET_DIR | Private writable directory for encrypted sensitive responses |
| NETBIRD_VAULT_KEY | 32 random bytes encoded in base64, required outside Windows; optional on Windows |
| NETBIRD_LOCAL_CONFIG | Optional private Windows JSON with url, tokenFile and secretDir |

For Windows DPAPI, tokenFile points to a PAT encrypted with ConvertFrom-SecureString under the Windows account running the MCP. Never commit this configuration or the encrypted files.

On macOS/Linux, configure a separately held AES-256-GCM vault key. Generate it once in a private local terminal using a cryptographic secret manager or Node's crypto.randomBytes. Keep it available for decrypting stored results. Losing the key prevents recovery.

NETBIRD_SECRET_DIR is required before mutations or sensitive results. Retrieve Windows responses with scripts/show-local-secret.ps1. Retrieve portable responses in a private local terminal with:

```sh
node scripts/decrypt-response.mjs /path/to/response.enc.json
```

This prints the secret locally. Do not run it through an AI conversation tool or paste its output into chat.

## Tools

| Tool | Purpose |
|---|---|
| search_api | Search and paginate the operation catalog |
| describe_api | Inspect the official parameters and request schema |
| read_api | Execute a catalogued read-only operation |
| preview_api | Preview any documented write, deletion or action |
| apply_preview | Apply one exact, unexpired preview after user approval |
| discard_preview | Cancel a pending preview |
| list_peers, list_groups, list_policies, list_networks, list_routes | Legacy read shortcuts |
| preview_group, preview_policy | Legacy group/policy shortcuts |

Example workflow:

1. Search for the resource and inspect its schema.
2. Read current state and identify resource IDs.
3. Preview the full proposed request. PUT may replace omitted fields.
4. Present the target, before-state, proposed request and warnings.
5. Obtain explicit user approval before calling apply_preview.

Local request secrets can use a placeholder such as {"$secret_env":"NETBIRD_NEW_PASSWORD"}. Supply the variable outside chat. The main NetBird PAT and vault key cannot be reused as request placeholders.

## Safety model and limits

- Read tools reject catalogued mutations, including the known action-oriented GET endpoints.
- AJV validates request types, required fields, formats and constraints from the pinned API specification.
- Previews expire after five minutes, are process-local and single-use, and cannot be edited at application time.
- Where readable state exists, the MCP checks it again before writing. NetBird provides no atomic compare-and-set guarantee, so a concurrent change can still occur after that check.
- **The human approval is enforced by the host workflow and skill instructions.** Holding a preview ID is sufficient to call the apply tool. Configure host tool approvals if you need an independent approval barrier.
- An overview of the exact API request is not a simulation of every downstream effect. Deletions, billing, credentials and identity operations can have irreversible effects.
- Mutations are never automatically retried. A network timeout can leave the server-side result uncertain.
- Known sensitive response fields are redacted and the complete response is encrypted locally. Arbitrary API text or custom fields may contain sensitive data. Review outputs before sharing.
- Cloud and commercial routes may be unavailable on self-hosted instances. Every operation remains constrained by the PAT and server permissions.

The catalog is pinned to NetBird **0.82.0**, not future or undocumented endpoints. See [upstream OpenAPI](https://github.com/netbirdio/netbird/blob/v0.82.0/shared/management/http/api/openapi.yml).

## Development

```sh
npm ci
npm run catalog:generate
npm run build
npm test
npm run package:plugins
npm run check
```

The official MCP SDK handles stdio transport and protocol negotiation. Tests use the official MCP client and a simulated NetBird API. They cover schema validation, create/update/delete, stale state, expiration, cancellation, tampering, single-use previews, encrypted secrets and non-JSON responses. No production writes are performed by the test suite.

Sources live in src, the pinned specification and generated catalog in data, and generated installable packages in plugins. scripts/package-plugins.mjs builds the three host layouts from one source. Compiled bundles are committed so host installs do not need package-manager execution.

## Privacy, security and license

The MCP sends requests only to the configured NetBird HTTPS origin. It has no telemetry service. Your AI host still receives redacted API outputs according to that host's policies. Review [privacy](docs/PRIVACY.md), [security](SECURITY.md) and [contributing](CONTRIBUTING.md).

Project code is MIT-licensed. The NetBird specification retains its upstream BSD-3-Clause notice in data/NETBIRD-LICENSE.txt. Bundled dependency notices are recorded in THIRD-PARTY-NOTICES.txt.
