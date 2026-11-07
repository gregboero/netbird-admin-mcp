# Privacy

NetBird Admin MCP is self-hosted software. The maintainer operates no backend, analytics endpoint or credential collection service for it.

The MCP uses a user-supplied PAT to communicate with the configured NetBird origin. It refuses HTTP redirects. API responses can contain device names, addresses, user details and access configuration. Redacted results are returned to the AI host, whose data handling policies apply.

Known credential fields are masked. Complete sensitive responses are encrypted in the configured private directory with Windows DPAPI or a separately configured AES-256-GCM key. Encryption does not prevent the signed-in Windows user, an administrator or a compromised runtime from accessing data. Arbitrary text and custom fields may require additional review before sharing.

Previews are kept in process memory and expire after five minutes. Restarting the MCP discards them. The software does not automatically delete encrypted response files. Users control retention and can delete those files and revoke the PAT through NetBird.

Private configuration, tokens, encrypted responses and real device inventories must not be included in public issues or submissions.
