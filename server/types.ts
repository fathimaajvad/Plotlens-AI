import { z } from 'zod';
export const ListingSchema = z.object({ id: z.string().min(1), title: z.string().min(3).max(120), locality: z.string().min(2).max(80), price: z.number().positive(), areaCent: z.number().positive(), landType: z.string().default('Residential'), description: z.string().max(2000).default(''), image: z.string().url().optional(), coordinates: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), precision: z.literal('verified') }).optional(), sellerName: z.string().default('Owner'), sellerDeclared: z.boolean().default(true), promoted: z.boolean().default(false), urgent: z.boolean().default(false), createdAt: z.string().default(new Date().toISOString()), demo: z.boolean().default(true), sold: z.boolean().default(false) });
export type Listing = z.infer<typeof ListingSchema>;
export const ExternalInvestigationSubjectSchema = z.object({
 id:z.string().min(1).max(160),title:z.string().min(3).max(240),locality:z.string().min(2).max(80).optional(),
 price:z.number().positive().optional(),areaCent:z.number().positive().optional(),landType:z.string().max(80).default('Unknown'),
 description:z.string().max(2000),sourceUrl:z.string().url(),sourceDomain:z.string().min(1).max(120),
 provenance:z.literal('serpapi'),external:z.literal(true),image:z.string().url().optional(),sellerName:z.string().default('External source'),
 sellerDeclared:z.literal(false).default(false),promoted:z.literal(false).default(false),urgent:z.literal(false).default(false),
 createdAt:z.string().default(new Date().toISOString()),demo:z.literal(false).default(false),sold:z.literal(false).default(false),
});
export type ExternalInvestigationSubject = z.infer<typeof ExternalInvestigationSubjectSchema>;
export type InvestigationSubject = Listing | ExternalInvestigationSubject;
export type Evidence = { id: string; title: string; url: string; snippet: string; publishedAt: string | null; retrievedAt: string; query: string; sourceType: string; claimIds: string[]; origin: 'live' | 'demo'; provenance?: string };
export type Claim = { id: string; text: string; category: string; origin: 'seller' | 'buyer' | 'external_source'; status: 'seller_provided'|'sourced'|'conflicting'|'not_found'|'not_searched'|'unverified'|'provider_error'; supportingEvidenceIds: string[]; conflictingEvidenceIds: string[]; explanation: string; nextCheck: string };
export type TraceEvent={at:string;stage:'planning'|'search'|'normalize'|'analysis'|'follow_up'|'gates'|'coverage'|'report';message:string;status:'complete'|'active'|'failed';searchCount:number;sourceCount:number};
