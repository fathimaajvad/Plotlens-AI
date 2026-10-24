# API Reference

The API is implemented in `server/index.ts`. Development runs at `http://localhost:3001`; Vite proxies `/api` to it. There is no authentication or authorization. JSON request bodies are limited to 32 KB. Validation failures use HTTP 400 and the error envelope below.

## Routes

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | API liveness and provider configuration booleans. |
| `GET /api/listings` | Filter and sort native catalogue listings. |
| `GET /api/listings/:id` | Return one seed or current-session listing. |
| `POST /api/listings` | Create an API-session listing. |
| `PATCH /api/listings/:id` | Partially update a listing created in the current API process. |
| `GET /api/property-search` | Combine native results with bounded public search metadata. |
| `GET /api/maps/status` | Report map-link and Street View embed status. |
| `POST /api/passport` | Generate or return a cached Plot Passport investigation. |
| `GET /api/investigations` | List up to 20 recent in-memory investigation summaries. |
| `GET /api/investigations/:id` | Return one in-memory investigation report. |

## Health and maps status

`GET /api/health` example (values are configuration booleans, not credentials):

```json
{
  "ok": true,
  "mode": "demo",
  "providers": {
    "serpapi": false,
    "openai": false,
    "openaiKeyPresent": false,
    "openaiModelConfigured": false,
    "streetViewConfigured": false
  }
}
```

`mode` is `demo`, `limited`, or `live` based on configured provider values; it does not mean that a particular request succeeded. `GET /api/maps/status` returns `streetViewEmbedConfigured: false`, `googleMapsLinkAvailable: true`, and a note that no Google key is sent to the browser.

## Listings

`GET /api/listings` accepts optional query parameters:

| Parameter | Validation |
| --- | --- |
| `q` | Trimmed text, up to 120 characters. |
| `locality` | 2–80 characters, case-insensitive exact match. |
| `landType` | `Residential`, `Agricultural`, `Commercial`, or `Industrial`. |
| `maxPrice` | Positive number, maximum 10,000,000,000. |
| `minArea`, `maxArea` | Positive numbers, maximum 100,000; minimum cannot exceed maximum. |

Returns a JSON array of listing objects. Seed records carry `demo: true`. Listing schema includes `id`, `title`, `locality`, `price`, `areaCent`, `landType`, `description`, optional `image`, optional verified `coordinates`, `sellerName`, `sellerDeclared`, `promoted`, `urgent`, `createdAt`, `demo`, and `sold`.

`POST /api/listings` accepts a listing object without `id`, `createdAt`, or `demo`; server creates these fields and returns `201` plus the listing. Required values include a 3–120 character title, 2–80 character locality, positive price and area. Optional coordinates require latitude/longitude ranges and `precision: "verified"`. `PATCH /api/listings/:id` accepts a partial listing object. Only API-session listings can be modified; a seed listing returns `404`.

These mutations are held in memory and disappear when the server restarts. This endpoint has no authentication; do not expose it publicly without adding access controls.

## Public property search

`GET /api/property-search` requires at least one of `q` or `locality`. It accepts the listing filters above plus `refresh=0|1`; `refresh=1` bypasses the one-minute server cache. The endpoint makes at most three concurrent SerpApi searches and returns at most 40 deduplicated normalized external results.

Response shape:

```json
{
  "native": [],
  "external": [],
  "searches": 3,
  "completed": 3,
  "failed": 0,
  "queries": ["search text"],
  "sourceDomains": ["example.com"],
  "listingCount": 0,
  "cached": false,
  "mode": "live"
}
```

`external` entries include `id`, classification/source type, source name, title, original URL/domain, snippet, query, retrieval timestamp, provenance, missing/inferred field arrays, and optional supported price/area/locality/publication date. `listingCount` counts individual listing detail pages meeting the implementation's URL classification, not all results. Search/category pages are retained as discovery. No result is a verified listing. When some provider calls fail, `providerError` describes partial results; when SerpApi is unconfigured the response includes an empty external list and configuration message. A provider-wide request failure returns `502`.

## Plot Passport and investigation history

`POST /api/passport` body:

```json
{
  "listing": { "id": "plot-id", "title": "Example plot", "locality": "Kochi", "price": 1000000, "areaCent": 5 },
  "concerns": ["Flooding and waterlogging"]
}
```

The subject must satisfy either the listing schema or the external investigation subject schema in `server/types.ts` (external subjects include original source URL/domain and fixed SerpApi provenance markers). `concerns` defaults to an empty list, supports up to four entries of 1–200 trimmed characters. The actual response contains `id`, `mode`, `listingId`, `createdAt`, `claims`, normalized `evidence`, `coverage`, `waterRisk`, executed `events`, `searchCount`, `providerFailures`, `buyerQuestions`, `limitations`, and `status`. Field structures are defined by the controller/types and can evolve with the implementation.

Investigation uses at most three initial locality searches and one targeted follow-up. OpenAI analysis requires both the API key and model and is skipped without a locality. Responses are cached in process memory for one minute; identical in-flight requests are shared. Provider or analysis errors do not convert missing evidence into a safety finding. Controller failure returns `502`.

`GET /api/investigations?listingId=<id>` optionally filters summaries by listing ID and returns at most 20 recent entries. `GET /api/investigations/:id` returns the full report. Reports are not durable and are cleared on restart.

## Errors

Application errors use:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Invalid property search",
    "details": {}
  }
}
```

`details` is included for Zod validation errors when present. Common codes include `VALIDATION`, `NOT_FOUND`, `PROPERTY_SEARCH_FAILED`, `INVESTIGATION_FAILED`, `INVALID_JSON`, and `INTERNAL`. Malformed JSON returns `400`; unexpected errors return a generic `500` message. Provider errors avoid returning credential values.
