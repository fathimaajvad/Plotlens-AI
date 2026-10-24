# Public Demo Deployment

## Current state

This repository is prepared for a split deployment: Vercel serves the Vite build and Render runs the Express API. No deployment URL is committed or claimed until a provider deployment is created and verified. The repository does not contain provider account credentials and no deployment CLI/account connection is available in this workspace.

## Render API service

The root [`render.yaml`](../render.yaml) defines a Node web service named `plotlens-api`, builds with `npm ci && npm run build`, starts with `npm start`, and uses `GET /api/health` for its health check. Render supplies the runtime `PORT`; `server/index.ts` listens on that value.

1. Sign in at [Render Dashboard](https://dashboard.render.com) and choose **New → Blueprint**. Select `fathimaajvad/Plotlens-AI` and branch `main`.
2. Review the `plotlens-api` service and deploy the Blueprint. The Blueprint prompts for `SERPAPI_API_KEY`, `OPENAI_API_KEY`, and `OPENAI_MODEL`; enter values directly in Render only if the corresponding provider account has active API access. These values are backend-only. If a provider credential is not available, do not enter a fake value: create the web service manually with the same build/start/health settings and omit the optional provider variables, then add them later in Render's service environment settings.
3. After Render creates the service, copy its assigned HTTPS origin (the service's `onrender.com` URL). The exact value is not known until the provider creates the service.
4. Confirm `https://<render-service-host>/api/health` returns JSON with `ok: true`. Do not expose environment values while troubleshooting.

## Vercel frontend

1. Sign in at [Vercel New Project](https://vercel.com/new) and import `fathimaajvad/Plotlens-AI` from GitHub, using the repository root.
2. Use the Vite build command `npm run build` and output directory `dist`. Add the public, non-secret environment variable `VITE_API_BASE` with the Render service's HTTPS origin only (no trailing path required). Do not add backend credentials to Vercel.
3. Deploy the project and copy its assigned production HTTPS origin.
4. In Render service environment settings, set `FRONTEND_ORIGIN` to that exact Vercel origin. For additional explicitly used preview origins, use a comma-separated list. Save and redeploy the API service.
5. Redeploy the Vercel frontend after the API origin environment variable is configured. Verify the health route, then search a locality in the public UI and confirm the browser's network panel shows successful same-origin-to-API fetches and no CORS errors.

`VITE_API_BASE` is compiled into public browser JavaScript and must contain only the public API origin. The backend allows the configured `FRONTEND_ORIGIN` values in production; local Vite/preview origins are allowed only when `NODE_ENV` is not `production`. CORS is not authentication or API access control.

## Verification checklist

- Frontend root URL loads over HTTPS and survives a page refresh.
- `GET <API origin>/api/health` returns `ok: true`; inspect provider booleans, not credential values.
- `GET <API origin>/api/listings` returns the catalogue.
- `GET <API origin>/api/property-search?locality=Kumbalangi` reports live results only if SerpApi is configured; otherwise it must clearly report that provider search is not configured.
- Generate a Plot Passport only after confirming provider configuration. Without keys, demo/limited reports should describe that no live provider work was performed.
- Inspect built frontend assets and public responses for accidental secrets. Provider secrets must remain in Render's environment settings.

Do not add a Live Demo link to the README until the public frontend and backend have passed these checks. Render's [Free web services](https://render.com/docs/free) spin down after 15 minutes without traffic and take about a minute to wake on a subsequent request.
