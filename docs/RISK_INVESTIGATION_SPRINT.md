# Risk Investigation Sprint

## Audit and click path

The listing detail action calls `investigate(selected)` in `src/App.tsx`. That function posts the selected listing and selected concerns to `POST /api/passport`, switches to the Investigation workspace, and renders the returned report and controller events. The external search result detail has a parallel path through `investigateExternal`.

`server/index.ts` validates the request, builds a SerpApi provider from server-side `SERPAPI_API_KEY`, passes `OPENAI_API_KEY` and `OPENAI_MODEL` to `investigate`, and stores reports in the existing in-memory investigation collection. Identical reports are shared/cached. `server/investigation/controller.ts` bounds work to three initial searches plus one follow-up, normalizes sources, invokes `analyzeEvidence` when key and model are present, then applies `gateClaims`. `server/providers/openai.ts` uses the Responses API with Zod structured output. `server/providers/serpapi.ts` calls the live Google search endpoint with timeout. If providers are absent, the controller returns a demo-mode report with no fabricated evidence; the initial claims remain unsearched. No fixture-backed flood source was found in this path.

Existing weaknesses: search query construction can spend all initial requests on generic concerns; waterlogging has no explicit risk finding; the evidence gate removes locality-level links from parcel-specific flood claims entirely; the UI does not distinguish locality-context evidence from plot-specific evidence in a focused flood section. Reports are memory-only. Credential values were never inspected; a later health check reported both providers configured, so one bounded live smoke run was performed and documented in `BUILD_STATUS.md`.

## Implementation plan

1. Add a dedicated risk-investigation helper to create flood/waterlogging claims and a deterministic, bounded set of locality-aware flood, drainage/hydrology, and additional concern queries.
2. Keep flood assessments parcel-specific checks unverified unless evidence is genuinely parcel-specific; retain contextual locality sources and their links with an explicit area-level explanation.
3. Add report metadata for risk scope and summary, include relevant sources, and render a waterlogging section with evidence scope, provider outcomes, and practical unknowns in the current Investigation/Passport interface.
4. Add mocked tests for locality versus parcel scope, source ID integrity, missing credentials, provider failures, conflicting evidence, and demo/live separation; run tests/build and update setup/status docs with observed outcomes.


## Final property-search integration

The final demo readiness sprint sets portal-preferred, locality-based queries within the three-request budget, distinguishes individual property detail pages from category/search discovery pages, preserves the provider URL and retrieval provenance, labels missing values, and exposes cache state with a one-minute refresh path. In the 2026-10-24 live Kumbalangi check, 29 normalized provider results included three individual pages (99acres, Magicbricks, helloaddress.com); the rest were discovery pages. This is fewer than five, so the feed reports three and adds no synthetic listings. Tests/build status and the source URLs are in `BUILD_STATUS.md`.
