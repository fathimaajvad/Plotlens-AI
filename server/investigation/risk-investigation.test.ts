import { describe, expect, it } from 'vitest';
import { buildRiskQueries, buildWaterRiskAssessment, ensureWaterRiskClaim } from './risk-investigation.js';
import { investigate } from './controller.js';
import { gateClaims } from './evidence.js';
import { listings } from '../listings.js';
import type { Claim, Evidence } from '../types.js';

const localitySource: Evidence = {
  id: 'ev-1', title: 'Kumbalangi flood and waterlogging report', url: 'https://example.org/report',
  snippet: 'Residents in Kumbalangi reported waterlogging after heavy rain.', publishedAt: null,
  retrievedAt: '2026-10-24T00:00:00.000Z', query: 'Kumbalangi flood reports', sourceType: 'example.org',
  claimIds: [], origin: 'live',
};
const waterClaim: Claim = {
  id: 'check-waterlogging', text: 'Historical flooding, waterlogging, or drainage problems affecting this plot',
  category: 'flood and drainage risk', origin: 'buyer', status: 'not_searched',
  supportingEvidenceIds: [], conflictingEvidenceIds: [], explanation: '', nextCheck: 'Inspect after rain',
};

describe('risk investigation', () => {
  it('generates no searches for unknown locations and caps locality work at three focused queries', () => {
    expect(buildRiskQueries(undefined, ['Flooding'])).toEqual([]);
    const queries = buildRiskQueries('Kumbalangi', ['Flooding', 'Legal road access']);
    expect(queries).toHaveLength(3);
    expect(queries[0]).toMatch(/flooding|waterlogging/i);
    expect(queries[1]).toMatch(/drainage|water stagnation|backwater/i);
    expect(queries[2]).toMatch(/official flood hazard map|disaster management/i);
  });

  it('keeps locality findings linked but does not promote them to plot-level support', () => {
    const claims = [waterClaim];
    const gated = gateClaims(claims, [localitySource], [{
      claimId: waterClaim.id, status: 'conflict', evidenceIds: ['ev-1'],
      reason: 'The locality report describes waterlogging; it does not identify this parcel.', nextCheck: 'Inspect the plot',
    }], 'Kumbalangi');
    expect(gated[0].status).toBe('unverified');
    expect(gated[0].conflictingEvidenceIds).toEqual(['ev-1']);
    expect(localitySource.claimIds).toContain(waterClaim.id);
    const report = buildWaterRiskAssessment({ ...listings[0]!, locality: 'Kumbalangi' }, gated, [localitySource]);
    expect(report.scope).toBe('locality');
    expect(report.evidenceIds).toEqual(['ev-1']);
    expect(report.summary).toContain('They do not establish');
  });

  it('surfaces locality-matched flood records as context without claiming plot support', () => {
    const claims = [waterClaim];
    const report = buildWaterRiskAssessment({ ...listings[0]!, locality: 'Kumbalangi' }, claims, [localitySource]);
    expect(report.scope).toBe('locality');
    expect(report.evidenceIds).toContain('ev-1');
    expect(report.summary).toMatch(/do not establish whether this specific plot/i);
    expect(claims[0]!.status).toBe('not_searched');
  });

  it('marks missing-provider runs as demo and does not invent evidence', async () => {
    const report = await investigate(listings[0]!, ['Flooding and waterlogging'], { live: false });
    expect(report.mode).toBe('demo');
    expect(report.searchCount).toBe(0);
    expect(report.evidence).toEqual([]);
    expect(report.waterRisk.status).toBe('not_searched');
    expect(report.events.some((event) => /no live search was attempted/i.test(event.message))).toBe(true);
  });

  it('marks provider failures separately from empty search results', async () => {
    const report = await investigate(listings[0]!, ['Flooding and waterlogging'], {
      live: true, search: async () => { throw Object.assign(new Error('offline'), { status: 503 }); },
    });
    expect(report.searchCount).toBe(3);
    expect(report.providerFailures).toBe(3);
    expect(report.waterRisk.status).toBe('provider_error');
    expect(report.events.some((event) => event.status === 'failed' && /HTTP 503/.test(event.message))).toBe(true);
  });

  it('does not create a risk claim if it is already represented by a buyer concern', () => {
    const claims = [waterClaim];
    expect(ensureWaterRiskClaim(claims)).toBe(waterClaim);
    expect(claims).toHaveLength(1);
  });
});


