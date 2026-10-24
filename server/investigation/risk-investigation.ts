import type { Claim, Evidence, InvestigationSubject } from '../types.js';

export type WaterRiskAssessment = {
  status: Claim['status'];
  scope: 'plot' | 'locality' | 'unknown';
  summary: string;
  evidenceIds: string[];
  unresolvedChecks: string[];
};

const floodTerms = /flood|waterlog|water stagnation|drainage|water level/i;

export function buildRiskQueries(locality: string | undefined, concerns: string[]): string[] {
  if (!locality?.trim()) return [];
  const place = locality.trim();
  const queries = [
    `${place} Kerala flooding waterlogging historical flood reports`,
    `${place} Kochi drainage water stagnation low lying canal backwater`,
  ];
  const additional = concerns.find((concern) => !floodTerms.test(concern));
  queries.push(`${place} Kerala official flood hazard map disaster management reports${additional ? ` ${additional}` : ''}`);
  return queries.slice(0, 3);
}

export function ensureWaterRiskClaim(claims: Claim[]): Claim {
  const existing = claims.find((claim) => floodTerms.test(`${claim.text} ${claim.category}`));
  if (existing) return existing;
  const claim: Claim = {
    id: 'check-waterlogging', text: 'Historical flooding, waterlogging, or drainage problems affecting this plot',
    category: 'flood and drainage risk', origin: 'buyer', status: 'not_searched',
    supportingEvidenceIds: [], conflictingEvidenceIds: [],
    explanation: 'This check has not yet been evaluated.',
    nextCheck: 'Ask about waterlogging history, inspect drainage after rain, and request plot-specific elevation and drainage information.',
  };
  claims.unshift(claim);
  return claim;
}

export function buildWaterRiskAssessment(listing: InvestigationSubject, claims: Claim[], evidence: Evidence[]): WaterRiskAssessment {
  const claim = claims.find((item) => floodTerms.test(`${item.text} ${item.category}`));
  const ids = claim ? [...new Set([...claim.supportingEvidenceIds, ...claim.conflictingEvidenceIds])] : [];
  const localityName = listing.locality?.toLowerCase();
  const contextual = evidence.filter((item) => {
    const text = `${item.title} ${item.snippet}`.toLowerCase();
    return Boolean(localityName && text.includes(localityName) && floodTerms.test(text));
  });
  const relevant = evidence.filter((item) => ids.includes(item.id) || contextual.some((context) => context.id === item.id));
  const scope: WaterRiskAssessment['scope'] = listing.locality ? 'locality' : 'unknown';
  let summary: string;
  if (claim?.status === 'provider_error') summary = 'A provider error prevented a reliable search conclusion. Treat flood and drainage risk as unknown.';
  else if (contextual.length && scope === 'locality') summary = 'Search-result sources mention flood, waterlogging, or drainage context for this locality. They do not establish whether this specific plot floods or drains adequately; inspect each source and verify conditions on site.';
  else if (claim?.status === 'not_searched') summary = listing.locality ? 'No live investigation was run. Flood and drainage conditions remain unknown.' : 'Location is missing. Add a locality or verified coordinates before investigating area-level flood context.';
  else if (claim?.status === 'conflicting') summary = 'Retrieved sources conflict. The available online evidence cannot resolve flood or drainage conditions for this plot.';
  else if (claim?.status === 'not_found') summary = 'No usable flood or drainage evidence was found in the searches performed. Absence of reports does not establish safety.';
  else summary = 'Plot-specific flood and drainage conditions remain unverified and require inspection and supporting documents.';
  return {
    status: claim?.status || 'not_searched', scope: relevant.length ? scope : listing.locality ? 'locality' : 'unknown', summary,
    evidenceIds: relevant.map((item) => item.id),
    unresolvedChecks: [
      'Obtain the survey number or credible parcel coordinates, and confirm they identify this exact parcel.',
      'Inspect after heavy rainfall and ask nearby residents about historical water stagnation.',
      'Request site elevation, drainage plans, boundary survey, and any official hazard-map assessment.',
    ],
  };
}


