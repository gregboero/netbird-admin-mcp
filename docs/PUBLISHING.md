# Publication status and reviewer guide

Publisher handle: gregboero. This is an independent community integration.

## Release 0.4.0

- Public source and downloadable packages are available in the GitHub release.
- CI passed on Windows and Ubuntu with Node.js 22 and 24.
- Claude plugin and marketplace validation passed in strict mode.
- The official MCP SDK client passed isolated integration tests, and live reads plus a cancelled preview were checked against a self-hosted instance.
- No official-store submission has been sent. OpenAI and Claude portal sign-in is pending. OpenAI local-MCP eligibility is unverified. Grok Bot requires publisher contact fields and an observed in-app test.

## Codex / OpenAI

The repository is installable through its own Codex marketplace. A public-directory listing is a separate review.

OpenAI currently limits local-MCP public submissions to approved partner organizations. The publisher must have the submitting organization allowlisted and complete identity verification. Source and local test success do not establish eligibility.

Upload the Codex ZIP only after eligibility is confirmed. The package contains a local stdio MCP and no hosted public API service.

- https://developers.openai.com/plugins/deploy/desktop-only
- https://developers.openai.com/plugins/deploy/submission

## Claude

The repository exposes a Claude Code marketplace and a native .claude-plugin manifest. Claude Code CLI validation is part of local verification.

Submit through https://claude.ai/directory/manage using an eligible paid account. Anthropic's directory and its official partner marketplace have different processes. A directory upload can be reviewed before the listing becomes public.

- https://code.claude.com/docs/en/plugins/publish

## Grok Bot / Cursor

The Grok Bot submission form accepts a public GitHub repository or MCP server URL. Use the repository and plugins/grokbot package, with its Cursor-compatible manifest.

The form requires publisher first/last name, work email, organization name and handle, logo URL, description, testing instructions, and an affirmation that local and in-app testing succeeded. Do not assert in-app success until it has been observed.

- https://x.ai/bot/marketplace/submit-a-plugin
- https://cursor.com/docs/reference/plugins

## Suggested description

Community NetBird administration with schema-validated requests, 231 documented API operations, encrypted credential responses, and explicit previews before changes.

## Reviewer test sequence

1. Use a disposable NetBird 0.82.0 test instance and a dedicated service PAT.
2. Install the platform package and configure the HTTPS origin and secrets outside chat.
3. List tools, search the catalog, and read peers and groups.
4. Preview a new empty group, approve it explicitly, apply once, then verify membership.
5. Generate two updates for the same group, apply one, and verify that applying the stale one is refused.
6. Verify that cancelled, expired and already-applied previews cannot be used.
7. Preview and approve deletion of the disposable group.
8. Verify generated credential responses are redacted and encrypted on the MCP runtime.

Do not use a real production admin token as review credentials. Contact and identity fields must be supplied by the publisher through the store portal, not committed to this repository.
