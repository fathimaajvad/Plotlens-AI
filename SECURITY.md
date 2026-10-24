# Security

PlotLens is a prototype and is not currently designed for public production deployment. The API has no authentication or authorization, uses permissive CORS, and stores listings and investigation reports in process memory. Do not expose a running instance to untrusted users without adding appropriate controls and reviewing the deployment configuration.

## Reporting a vulnerability

Please do not publish credentials, personal data, or an unpatched exploit in a public issue. If GitHub private vulnerability reporting is enabled for this repository, use that channel. Otherwise contact the repository maintainer privately through a contact method they have already published. Include affected version/commit, impact, and safe reproduction steps. No response-time commitment is made here.

## Handling credentials

- Keep provider credentials in the ignored root `.env` file or an appropriate deployment secret store.
- Do not place secrets in frontend code, commits, screenshots, logs, or support requests.
- If a credential is exposed, revoke or rotate it with its provider and remove the exposed copy from active use.
- `.env.example` is for blank configuration names only; never place live values in it.
