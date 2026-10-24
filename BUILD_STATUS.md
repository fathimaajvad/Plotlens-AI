# PlotLens integration status

## Investigation audit

The listing detail action calls `investigate(selected)` in `src/App.tsx` and posts to `POST /api/passport`. `server/index.ts` validates and routes the request to the investigation controller, using server-side SerpApi/OpenAI providers when configured. The previous implementation was not fixture-only: provider calls were real when configured, and demo mode returned no synthetic evidence. The gaps were generic query planning, no dedicated flood/waterlogging report, and dropped locality evidence links when the parcel-specific gate correctly refused plot-level conclusions.

## Implemented

- Dedicated waterlogging/flood investigation service with up to three initial searches and one follow-up: historical flood/waterlogging reports, drainage/hydrology context, and official flood-hazard/disaster-management material.
- No location-based search or model analysis when locality is unknown; the trace asks for a location instead of inferring one.
- Water-risk assessment with status, scope, concise summary, contextual source links/excerpts/timestamps, and unresolved physical/document checks. Locality sources remain contextual and do not prove conditions for a specific parcel.
- Evidence gates retain valid contextual source IDs while keeping parcel-specific flood claims unverified. Provider errors, no evidence, and no live search are distinguished.
- Investigation and Plot Passport show the risk section. External-source investigations retain their source attribution and can be inspected/retried from the same workspace.
- Audit and implementation plan: `docs/RISK_INVESTIGATION_SPRINT.md`.

## Verification

- `npm test`: 31 tests passed across six files. Provider environment variables were temporarily blanked for the test process, ensuring tests used mocked providers and spent no credits; no credential file was read or changed.
- `npm run build`: passed (TypeScript checks, Vite production build and server type-check).
- Local API health reports SerpApi and OpenAI configured; only boolean configuration state was inspected.
- One bounded live end-to-end Kumbalangi investigation completed in live mode: four searches total (three initial, one follow-up), zero provider failures, 36 normalized records. The report marked flood/drainage status `unverified` at `locality` scope. Returned sources included regional flood reports and a Kumbalangi-specific result. Search snippets/results were not treated as plot proof, and no full-page or official-map inspection is claimed.

## Limitations

SerpApi snippets and titles are not full-page verification. Result relevance can be broad or imperfect; a locality mention does not establish parcel applicability. No official parcel, elevation, drainage, flood-hazard, title, zoning or survey database is integrated. No model output certifies safety or legal status. Street View embedding remains unimplemented. Reports and API listings are in memory and reset on restart; there is no authentication or durable database.

`.env.example` contains blank placeholders and `.env*` is ignored by Git. A credential-like value previously found in the tracked template was removed. If those former values were live credentials, rotate them before use.

## Final demo readiness sprint update

- Property search now uses three locality-specific SerpApi queries, defaulting to OLX, 99acres, Magicbricks and Housing.com plus a general query. Configured `PROPERTY_SEARCH_DOMAINS` overrides the preferred portals.
- External data preserves original result URLs, portal name/domain, snippet, supported asking price/area/locality, retrieval time, query, missing fields and source type. Individual detail pages are counted apart from category/search discovery pages. Cached responses are marked and preserve retrieval times; explicit refresh bypasses the one-minute cache.
- One live Kumbalangi search completed all three requests with no provider errors and returned 29 normalized public results. Three were identifiable as individual property detail pages: 99acres, Magicbricks and helloaddress.com. The other results were category/search pages and are labeled discovery instead of being passed off as individual listings. There were fewer than five suitable individual listings, so no additional results were fabricated.
- Original URLs returned for the three individual pages were preserved in the API and card links. The 99acres and Magicbricks snippets supplied price and area; the helloaddress result supplied area but no price.
- A follow-up cached request returned `cached: true` with the original retrieval timestamps unchanged.
- `npm test`: 34 tests passed across six files. API tests dynamically import the app with provider variables blanked in the test process to avoid live provider calls; no credential files were edited or printed.
- `npm run build`: passed (TypeScript, Vite and server checks).
- `http://localhost:5173/` returned HTTP 200. Automated browser interaction was unavailable (no Playwright/Puppeteer installation or browser-control tool in this session); native listing CRUD, investigation history, provider-error and demo mode remain covered by API/tests. No second dev server was started.

Verified listing sources and original URLs:

- 99acres: https://www.99acres.com/residential-land-plot-for-sale-in-kumbalangi-kochi-774-sqyd-r1-spid-W78423693
- Magicbricks: https://www.magicbricks.com/propertyDetails/3-Cent-Residential-Plot-FOR-Sale-Kumbalangi-in-Kochi&id=4d423834373339313131
- helloaddress.com: https://www.helloaddress.com/details/P945651
