import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALITY, LOCALITIES, listingMarkers, localityFor } from './locations';

describe('locality map configuration', () => {
  it('ships a typed Kumbalangi centre and known supported locality centres', () => {
    expect(DEFAULT_LOCALITY).toBe('Kumbalangi');
    expect(localityFor('Kumbalangi').center).toEqual({ lat: 9.8847, lng: 76.2844 });
    expect(LOCALITIES.map((place) => place.name)).toContain('Kakkanad');
  });

  it('associates fictional markers as illustrative and owner records as locality-level unless verified coordinates exist', () => {
    const markers = listingMarkers([
      { id: 'plot-kakkanad', locality: 'Kakkanad', title: 'Demo', price: 10, demo: true },
      { id: 'owner-1', locality: 'Kumbalangi', title: 'Owner', price: 10, demo: true },
      { id: 'owner-2', locality: 'Aluva', title: 'Verified', price: 10, demo: false, coordinates: { lat: 10.1, lng: 76.3, precision: 'verified' } },
    ]);
    expect(markers.map((marker) => marker.precision)).toEqual(['illustrative', 'locality', 'verified']);
    expect(markers[1]?.point).toEqual(localityFor('Kumbalangi').center);
    expect(markers[2]?.point).toEqual({ lat: 10.1, lng: 76.3 });
  });
});
