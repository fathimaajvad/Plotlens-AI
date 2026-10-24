import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { analyzeEvidence } from './openai.js';
import { listings } from '../listings.js';

describe('OpenAI structured Responses analysis', () => {
  it('sends the configured model and schema-constrained report format to Responses API', async () => {
    const parsed = { sellerClaims: [], claims: [], buyerQuestions: ['Ask for the survey sketch'] };
    const parse = vi.fn().mockResolvedValue({ output_parsed: parsed });
    const client = { responses: { parse } } as unknown as OpenAI;
    const result = await analyzeEvidence({
      listing: listings[0]!, claims: [], evidence: [], apiKey: 'test-only', model: 'gpt-4o-mini', client,
    });
    expect(result).toEqual(parsed);
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-mini', max_output_tokens: 1800,
      text: { format: expect.objectContaining({ type: 'json_schema' }) },
    }));
  });
});
