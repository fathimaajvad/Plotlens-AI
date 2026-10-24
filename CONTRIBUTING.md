# Contributing

PlotLens is a prototype maintained as a small project. Focused fixes and documentation improvements are welcome.

## Local workflow

1. Use Node.js 20+ and npm. Install dependencies with `npm install`.
2. For provider-backed work, copy `.env.example` to the root `.env` and configure credentials locally. Never include credentials in source, screenshots, issue reports, or commits.
3. Run `npm run dev` to start the API and Vite UI, or run `npm run dev:server` and `npm run dev:web` in separate terminals.
4. Keep changes scoped to the issue and preserve provenance, missing-field, and demo labels in user-facing flows.
5. Before submitting, run `npm test` and `npm run build`. Include actual results and any required provider configuration; tests should use mocks and not spend API credits.

## Pull requests

- Use a short descriptive branch name and commit message.
- Explain the user-visible change and how it was verified.
- Link related issues when available and include genuine screenshots for UI changes.
- Add or update tests when behavior changes; do not claim data verification beyond the evidence available.
- Keep secrets, `.env`, dependencies, build output, and local captures that are not part of the change out of the PR.

For security-sensitive issues, follow [SECURITY.md](SECURITY.md) rather than posting exploit details publicly.
