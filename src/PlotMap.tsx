import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { listingMarkers, localityFor, type MappableListing } from './locations';

type Props = { locality: string; listings: MappableListing[]; selectedId?: string; onSelect: (id: string) => void };
const icon = (selected: boolean) => L.divIcon({ className: 'plot-marker-shell', html: `<span class="plot-marker ${selected ? 'selected' : ''}"><i></i></span>`, iconSize: [28, 36], iconAnchor: [14, 32], popupAnchor: [0, -30] });
function MapFocus({ locality, selectedId, listings }: Pick<Props, 'locality' | 'selectedId' | 'listings'>) {
  const map = useMap();
  const markers = useMemo(() => listingMarkers(listings), [listings]);
  useEffect(() => {
    const selected = markers.find((marker) => marker.listingId === selectedId);
    const target = selected?.point ?? localityFor(locality).center;
    map.invalidateSize();
    map.flyTo([target.lat, target.lng], selected ? Math.max(map.getZoom(), 14) : localityFor(locality).zoom, { duration: 0.7 });
  }, [locality, selectedId, markers, map]);
  return null;
}

export default function PlotMap({ locality, listings, selectedId, onSelect }: Props) {
  const [tileState, setTileState] = useState<'loading' | 'ready' | 'error'>('loading');
  const config = localityFor(locality);
  const markers = listingMarkers(listings);
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  return <div className="plot-map-frame">
    <MapContainer center={[config.center.lat, config.center.lng]} zoom={config.zoom} scrollWheelZoom={false} zoomControl aria-label={`${locality} interactive map`}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ loading: () => setTileState('loading'), load: () => setTileState('ready'), tileerror: () => setTileState('error') }} />
      <MapFocus locality={locality} selectedId={selectedId} listings={listings} />
      {markers.map((marker) => { const listing = byId.get(marker.listingId); if (!listing) return null; return <Marker key={marker.listingId} position={[marker.point.lat, marker.point.lng]} icon={icon(marker.listingId === selectedId)} eventHandlers={{ click: () => onSelect(marker.listingId) }}>
        <Popup><div className="map-popup"><b>{listing.title}</b><span>{listing.locality}{listing.price ? ' · ₹' + new Intl.NumberFormat('en-IN').format(listing.price) : ''}</span><small>{marker.precision === 'verified' ? 'Seller supplied coordinates' : marker.precision === 'illustrative' ? 'Illustrative demo position · not a surveyed plot' : 'Approximate locality centre · not a plot location'}</small></div></Popup>
      </Marker>; })}
    </MapContainer>
    {tileState !== 'ready' && <div className={'map-tile-state ' + tileState} role="status">{tileState === 'loading' ? 'Loading OpenStreetMap tiles…' : 'Map tiles could not load. Check your internet connection.'}</div>}
    <div className="map-accuracy"><span className="map-legend-dot"/> {markers.length} listing marker{markers.length === 1 ? '' : 's'} · {markers.some((marker) => marker.precision === 'verified') ? 'verified coordinates shown where supplied' : 'positions are approximate or illustrative'}</div>
  </div>;
}


