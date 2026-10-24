# Project Status

This status reflects the repository implementation and verification recorded for the current project. See [BUILD_STATUS.md](../BUILD_STATUS.md) for prior implementation and provider smoke details, and [Risk Investigation Sprint](RISK_INVESTIGATION_SPRINT.md) for investigation design notes.

## Implemented

| Area | Current state |
| --- | --- |
| Discovery | Native demo/API-session listings plus optional three-query SerpApi discovery; URL provenance, classification, supported fields and missing fields are shown. |
| Investigation | Bounded locality search, optional OpenAI structured analysis, normalized evidence, deterministic claim gates, waterlogging scope, source register and unresolved checks. |
| Maps | Leaflet/OSM map with approximate locality centres and optional explicitly verified coordinates. |
| Buyer tools | Save/compare, browser-local Deal Room notes/checklists, investigation history and printable report view. |
| Seller prototype | Create/edit/sold actions for API-session records; simulated promotion and illustrative metrics. |
| Persistence | No database. API state/cache reset on server restart; selected UI state lives in browser `localStorage`. |

## Verification

- `npm test`: 34 tests passed across six files on 2026-10-24. Provider environment variables were blanked for the test process; the tests mock providers.
- `npm run build`: passed on 2026-10-24 (TypeScript project checks, Vite production build, and server TypeScript check).
- A prior bounded live Kumbalangi public search returned 29 normalized results across three successful searches, including three individual detail-page candidates. These were provider results at that time, not a current availability guarantee.
- A prior bounded live investigation completed four searches with no provider failures and returned 36 normalized records; flood/waterlogging remained unverified at locality scope.
- The documentation capture of live discovery showed 24 normalized search results from three requests, with one individual detail-page candidate at that time. Search results can change between requests; this screenshot is not an availability or accuracy guarantee.
- Genuine UI captures include home, map, discovery, a demo-labeled native detail page, and Seller Studio. No Plot Passport screenshot was generated because it would require a new investigation/provider call.

Re-run `npm test` and `npm run build` against the current checkout to verify the current state. Commands are provider-independent and should use mocked providers.

## Known limitations and pending work

- No authentication, authorization, rate limiting, durable database, account system, or deployment configuration.
- Listing and investigation data are not persisted server-side across restarts.
- External search results are metadata/snippets and original links; there is no full-page portal scraping or completeness guarantee.
- No official title, ownership, boundary, survey, zoning, drainage, elevation, or parcel-level flood data integration.
- No embedded Street View, payments, or measured buyer activity analytics.
- The repository has no `LICENSE`; licensing remains unspecified.

Potential future work (not implemented): durable storage and accounts, deployment/access controls, provider-independent parcel record integrations, and further verification of source pages under permitted provider terms.
