# Contributing

Open an issue for a bug or compatibility change. Use a disposable NetBird instance or the mock fixture for development.

Run npm ci, npm run catalog:generate, npm run build, npm test, npm run package:plugins and npm run check before submitting a pull request. Include generated catalog and package changes when their source changes.

Changes to mutating tools must preserve the preview workflow, request validation, secret redaction, and one-use plan handling. Include a regression test for affected failure behavior.

Keep credentials, local configuration, generated secret files, production identifiers and personal contact details out of commits. Public reports should use reserved example domains and synthetic data.
