import { randomUUID } from 'node:crypto';
import type { Claim, Evidence, InvestigationSubject, TraceEvent } from '../types.js';
import { normalizeRecords, gateClaims, coverage } from './evidence.js';
import type { SearchProvider } from '../providers/serpapi.js';
import { analyzeEvidence, type Analysis, validateAnalysisOutput } from '../providers/openai.js';
import { buildRiskQueries, buildWaterRiskAssessment, ensureWaterRiskClaim } from './risk-investigation.js';

const providerHint = (name: string, error: unknown) => {
  const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined;
  if (status === 401 || status === 403) return `${name} authentication or account access failed (HTTP ${status}); check the server credential and account access.`;
  if (status === 404) return `${name} model or endpoint was not found (HTTP 404); check OPENAI_MODEL and provider access.`;
  if (status === 429) return `${name} quota or rate limit reached (HTTP 429); check account quota and retry later.`;
  if (status) return `${name} request failed (HTTP ${status}); no evidence conclusion was drawn.`;
  return `${name} request failed or timed out; no evidence conclusion was drawn.`;
};

function buildClaims(listing: InvestigationSubject, concerns: string[]): Claim[] {
  const claims: Claim[] = [];
  if ('external' in listing && listing.external) {
    if (listing.price) claims.push({ id: 'external-asking-price', text: `External listing source states asking price ₹${listing.price.toLocaleString('en-IN')}`, category: 'asking price', origin: 'external_source', status: 'unverified', supportingEvidenceIds: [], conflictingEvidenceIds: [], explanation: 'Price was present in a public search-result snippet. This verifies only what that source states, not the seller or property.', nextCheck: 'Open the original listing and confirm that the price is current and applies to this parcel.' });
    if (listing.areaCent) claims.push({ id: 'external-area', text: `External listing source states area ${listing.areaCent} cents`, category: 'plot area', origin: 'external_source', status: 'unverified', supportingEvidenceIds: [], conflictingEvidenceIds: [], explanation: 'Area was present in a public search-result snippet and has not been independently checked.', nextCheck: 'Confirm area against the latest survey sketch and parcel records.' });
  } else if (listing.price && listing.areaCent) {
    claims.push({ id: 'claim-asking-price', text: `Seller asks ₹${listing.price.toLocaleString('en-IN')} for ${listing.areaCent} cents`, category: 'asking price', origin: 'seller', status: 'seller_provided', supportingEvidenceIds: [], conflictingEvidenceIds: [], explanation: 'Seller-provided asking price and area. Asking prices are not completed-sale prices.', nextCheck: 'Confirm price and parcel measurement with the seller.' });
  }
  claims.push(...concerns.map((text, index) => ({ id: `check-${index + 1}`, text, category: 'buyer concern', origin: 'buyer' as const, status: 'not_searched' as const, supportingEvidenceIds: [] as string[], conflictingEvidenceIds: [] as string[], explanation: 'Investigation has not yet evaluated this check.', nextCheck: `Request plot-specific evidence and an independent professional check for ${text.toLowerCase()}.` })));
  claims.push({ id: 'check-title-records', text: 'Title and encumbrance records for the specific parcel', category: 'title and encumbrance', origin: 'buyer', status: 'not_searched', supportingEvidenceIds: [], conflictingEvidenceIds: [], explanation: 'Public web search cannot replace review of official parcel records.', nextCheck: 'Ask a qualified property lawyer to review the title chain and encumbrance records.' });
  return claims;
}

export async function investigate(listing: InvestigationSubject, concerns: string[], deps: {
  search?: SearchProvider; live: boolean; openaiKey?: string; model?: string;
  now?: () => Date; analyze?: typeof analyzeEvidence;
}) {
  const now = deps.now || (() => new Date());
  let searchCount = 0; let providerFailures = 0;
  const failedQueries = new Set<string>();
  const evidence: Evidence[] = [];
  const events: TraceEvent[] = [];
  const event = (stage: TraceEvent['stage'], message: string, status: TraceEvent['status'] = 'complete') => events.push({ at: now().toISOString(), stage, message, status, searchCount, sourceCount: evidence.length });
  const hasSearch = Boolean(deps.search);
  const hasOpenAIKey = Boolean(deps.openaiKey);
  const hasModel = hasOpenAIKey && Boolean(deps.model);
  const locality = listing.locality;
  const mode = hasSearch && hasModel && locality ? 'live' : hasSearch || hasOpenAIKey ? 'limited' : 'demo';
  let claims = buildClaims(listing, concerns);
  const waterRiskClaim = ensureWaterRiskClaim(claims);
  let analysis: Analysis | undefined;

  if ('external' in listing && listing.external) {
    evidence.push({ id: `source-${listing.id}`, title: listing.title, url: listing.sourceUrl, snippet: listing.description, publishedAt: null, retrievedAt: now().toISOString(), query: 'Original property search result', sourceType: listing.sourceDomain, claimIds: [], origin: 'live', provenance: listing.provenance });
  }
  const queries = buildRiskQueries(locality, concerns);
  event('planning', locality
    ? `Prepared ${claims.length} checks for ${locality}; prioritized flood history, drainage/hydrology, then other due-diligence checks`
    : 'Location is unknown; no locality or parcel search will be attempted. Request locality or verified coordinates.');
  if (hasSearch && locality) {
    for (const query of queries.slice(0, 3)) {
      searchCount++;
      try {
        const rows = await deps.search!(query);
        evidence.push(...normalizeRecords(rows, query, now(), evidence));
        event('search', `Search ${searchCount}/3 for ${query} returned ${rows.length} result(s)`);
      } catch (error) {
        providerFailures++; failedQueries.add(query);
        event('search', `Search ${searchCount}/3 failed: ${providerHint('SerpApi', error)}`, 'failed');
      }
    }
  } else if (hasSearch) event('search', 'Search skipped because the listing has no locality; no location was inferred', 'failed');
  else event('search', 'External search is not configured; no live search was attempted', mode === 'demo' ? 'complete' : 'failed');
  event('normalize', `Normalized and deduplicated ${evidence.length} source record(s)`);

  if (hasOpenAIKey && !deps.model) event('analysis', 'OPENAI_MODEL is missing. Set a model available to this account; AI analysis was not attempted.', 'failed');
  else if (!locality) event('analysis', 'Analysis skipped because the listing location is unknown; no locality was inferred.', 'failed');
  else if (hasModel) {
    event('analysis', 'Extracting source-grounded claims and preparing buyer questions', 'active');
    try {
      analysis = validateAnalysisOutput(await (deps.analyze || analyzeEvidence)({ listing, claims, evidence, apiKey: deps.openaiKey!, model: deps.model! }));
      const extracted = analysis.sellerClaims.filter((claim) => claim.quote.trim().length > 8 && claim.text.trim() === claim.quote.trim() && listing.description.toLowerCase().includes(claim.quote.trim().toLowerCase()));
      for (let index = 0; index < extracted.length; index++) {
        const claim = extracted[index]!;
        if (!claims.some((item) => item.text.toLowerCase() === claim.text.toLowerCase())) claims.push({ id: `seller-description-${index + 1}`, text: claim.text, category: claim.category, origin: 'seller', status: 'seller_provided', supportingEvidenceIds: [], conflictingEvidenceIds: [], explanation: 'Exact wording quoted from the listing description; not independently verified.', nextCheck: claim.nextCheck });
      }
      event('analysis', `Validated structured analysis for ${analysis.claims.length} checks and ${extracted.length} verbatim listing claims`);
    } catch (error) { event('analysis', `${providerHint('OpenAI', error)} Claims remain unverified.`, 'failed'); }
  } else event('analysis', 'OpenAI is not configured; no model analysis was attempted', mode === 'demo' ? 'complete' : 'failed');

  if (hasSearch && !analysis) {
    if (!locality) for (const claim of claims) if (claim.origin === 'buyer') { claim.status = 'not_searched'; claim.explanation = 'A locality or verified location is required before a location-based search can run.'; }
    if (failedQueries.has(queries[0]!) || failedQueries.has(queries[1]!)) { waterRiskClaim.status = 'provider_error'; waterRiskClaim.explanation = 'Flood-history and drainage searches failed; no conclusion was drawn.'; }
    if (providerFailures === searchCount && searchCount > 0) for (const claim of claims) if (claim.origin === 'buyer') { claim.status = 'provider_error'; claim.explanation = 'Search provider failed for all attempted queries; no conclusion was drawn.'; }
    for (const claim of claims) if (claim.origin === 'buyer' && claim.status !== 'provider_error') {
      if (hasModel || evidence.length) claim.status = 'unverified';
      else if (providerFailures === searchCount) { claim.status = 'provider_error'; claim.explanation = 'Search provider failed for all attempted queries; no conclusion was drawn.'; }
      else claim.status = 'not_found';
    }
  }
  claims = gateClaims(claims, evidence, analysis?.claims, locality);

  const followupClaim = claims.find((claim) => claim.id === waterRiskClaim.id && ['not_found', 'unverified', 'not_searched'].includes(claim.status)) || claims.find((claim) => claim.origin === 'buyer' && ['not_found', 'unverified', 'not_searched'].includes(claim.status));
  if (hasSearch && locality && followupClaim && searchCount < 4 && providerFailures === 0) {
    const query = followupClaim.id === waterRiskClaim.id
      ? `${locality} Kerala flood waterlogging drainage official reports historical events`
      : `${locality} Kochi ${followupClaim.text} official records`;
    searchCount++; event('follow_up', `Running one targeted follow-up for ${followupClaim.id}`, 'active');
    try {
      const rows = await deps.search!(query);
      const more = normalizeRecords(rows, query, now(), evidence);
      evidence.push(...more);
      event('follow_up', `Targeted follow-up returned ${rows.length} result(s)`);
      event('normalize', `Added ${more.length} new source record(s) after deduplication`);
      if (hasModel) {
        event('analysis', 'Rechecking unresolved claims against follow-up evidence', 'active');
        try { analysis = validateAnalysisOutput(await (deps.analyze || analyzeEvidence)({ listing, claims, evidence, apiKey: deps.openaiKey!, model: deps.model! })); event('analysis', 'Follow-up evidence analysis validated'); }
        catch (error) { event('analysis', `${providerHint('OpenAI', error)} Remaining claims stay unverified.`, 'failed'); }
      }
      claims = gateClaims(claims, evidence, analysis?.claims, locality);
    } catch (error) {
      providerFailures++; followupClaim.status = 'provider_error';
      followupClaim.explanation = 'The targeted follow-up search failed; no conclusion was drawn.';
      event('follow_up', providerHint('SerpApi', error), 'failed');
    }
  }
  for (const claim of claims) {
    const linked = claim.supportingEvidenceIds.length + claim.conflictingEvidenceIds.length;
    event('gates', `${claim.id}: ${claim.status}${linked ? ` with ${linked} linked source(s)` : ': evidence gap'}`);
    if (claim.status === 'conflicting') event('gates', `Conflict detected for ${claim.id}`);
  }
  event('gates', 'Applied evidence ID, relevance, parcel-specificity and conflict gates');
  const waterRisk = buildWaterRiskAssessment(listing, claims, evidence);
  event('gates', `Waterlogging assessment is ${waterRisk.status} at ${waterRisk.scope} scope`);
  const reportCoverage = coverage(claims);
  event('coverage', `${reportCoverage.checked} of ${reportCoverage.applicable} applicable checks have usable evidence`);
  event('report', 'Plot Passport ready');
  return {
    id: randomUUID(), mode, listingId: listing.id, createdAt: now().toISOString(), claims, evidence,
    coverage: reportCoverage, waterRisk, events, searchCount, providerFailures,
    buyerQuestions: analysis?.buyerQuestions || claims.filter((claim) => claim.origin === 'buyer').map((claim) => claim.nextCheck),
    limitations: ['This investigation is not a title search or legal opinion.', 'Search results may be incomplete, outdated, or about the wider locality rather than this specific parcel.', 'No result is not evidence that a risk is absent.', 'Seller-provided information has not been independently verified.'],
    status: 'complete' as const,
  };
}

