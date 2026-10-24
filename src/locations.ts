export type MapPoint = { lat: number; lng: number };
export type LocalityConfig = { name: string; center: MapPoint; zoom: number };

export const LOCALITIES: LocalityConfig[] = [
  { name: 'Kakkanad', center: { lat: 10.0159, lng: 76.3419 }, zoom: 13 },
  { name: 'Aluva', center: { lat: 10.1076, lng: 76.3457 }, zoom: 13 },
  { name: 'Tripunithura', center: { lat: 9.9495, lng: 76.349 }, zoom: 13 },
  { name: 'Kumbalam', center: { lat: 9.8788, lng: 76.317 }, zoom: 13 },
  { name: 'Kumbalangi', center: { lat: 9.8847, lng: 76.2844 }, zoom: 13 },
  { name: 'Fort Kochi', center: { lat: 9.9658, lng: 76.2421 }, zoom: 13 },
  { name: 'Edappally', center: { lat: 10.0267, lng: 76.308 }, zoom: 13 },
];

export const DEFAULT_LOCALITY = 'Kumbalangi';

export function localityFor(name: string): LocalityConfig {
  return LOCALITIES.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? {
    name,
    center: { lat: 9.9312, lng: 76.2673 },
    zoom: 12,
  };
}

export type MappableListing = { id: string; locality: string; title: string; price?: number; demo: boolean; coordinates?: MapPoint & { precision: 'verified' } };
export type ListingMarker = { listingId: string; point: MapPoint; precision: 'verified' | 'illustrative' | 'locality' };

// Fictional records use deterministic offsets to avoid stacking markers while clearly
// distinguishing the positions from surveyed parcel locations.
const DEMO_OFFSETS: Record<string, [number, number]> = {
  'plot-kakkanad': [0.003, 0.004], 'plot-aluva': [-0.002, 0.003],
  'plot-tripunitura': [0.002, -0.003], 'plot-kumbalam': [-0.002, -0.002],
};

export function listingMarkers(listings: MappableListing[]): ListingMarker[] {
  return listings.map((listing) => {
    if (listing.coordinates) return { listingId: listing.id, point: { lat: listing.coordinates.lat, lng: listing.coordinates.lng }, precision: 'verified' };
    const config = localityFor(listing.locality);
    const offset = listing.demo ? DEMO_OFFSETS[listing.id] : undefined;
    return { listingId: listing.id, point: offset ? { lat: config.center.lat + offset[0], lng: config.center.lng + offset[1] } : config.center, precision: offset ? 'illustrative' : 'locality' };
  });
}
