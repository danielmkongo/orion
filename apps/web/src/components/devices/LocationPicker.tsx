import { useRef, useState, useCallback, useEffect } from 'react';
import { MapPin } from 'lucide-react';

const GMAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? '';
const GMAPS_ID  = (import.meta as any).env?.VITE_GOOGLE_MAP_ID ?? 'DEMO_MAP_ID';

export function LocationPicker({ lat, lng, onChange }: {
  lat: number; lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const mapRef    = useRef<HTMLDivElement | null>(null);
  const gMapRef   = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  const initMap = useCallback((la: number, ln: number) => {
    if (!mapRef.current) return;
    const win = window as any;
    if (!win.google?.maps) return;
    const center = { lat: la || 20, lng: ln || 0 };
    const map = new win.google.maps.Map(mapRef.current, {
      center,
      zoom: la ? 13 : 2,
      mapTypeId: 'satellite',
      mapId: GMAPS_ID,
      streetViewControl: false,
      mapTypeControl: false,
      gestureHandling: 'cooperative',
    });
    gMapRef.current = map;

    const makeMarker = (pos: { lat: number; lng: number }) => {
      if (markerRef.current) markerRef.current.map = null;
      const el = document.createElement('div');
      el.style.cssText = 'width:14px;height:14px;background:hsl(var(--primary));border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer';
      const m = new win.google.maps.marker.AdvancedMarkerElement({ map, position: pos, content: el, gmpDraggable: true });
      m.addListener('dragend', (e: any) => onChange(e.latLng.lat(), e.latLng.lng()));
      markerRef.current = m;
    };

    if (la && ln) makeMarker(center);
    map.addListener('click', (e: any) => {
      const la2 = e.latLng.lat(), ln2 = e.latLng.lng();
      onChange(la2, ln2);
      makeMarker({ lat: la2, lng: ln2 });
    });
  }, [onChange]);

  useEffect(() => {
    if (!GMAPS_KEY) return;
    const win = window as any;
    if (win.google?.maps) {
      initMap(lat, lng);
    } else {
      const existing = document.querySelector('script[data-gmaps]');
      if (!existing) {
        const script = document.createElement('script');
        script.dataset.gmaps = '1';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=marker&callback=__gmapsReadyPicker`;
        win.__gmapsReadyPicker = () => initMap(lat, lng);
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', () => initMap(lat, lng));
      }
    }
  }, []); // eslint-disable-line

  const geocodeSearch = useCallback(async () => {
    if (!search.trim() || !GMAPS_KEY) return;
    setSearching(true);
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(search)}&key=${GMAPS_KEY}`);
      const json = await res.json();
      if (json.results?.[0]) {
        const { lat: la, lng: ln } = json.results[0].geometry.location;
        onChange(la, ln);
        if (gMapRef.current) { gMapRef.current.setCenter({ lat: la, lng: ln }); gMapRef.current.setZoom(13); }
        const win = window as any;
        if (markerRef.current) markerRef.current.map = null;
        const el = document.createElement('div');
        el.style.cssText = 'width:14px;height:14px;background:hsl(var(--primary));border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)';
        markerRef.current = new win.google.maps.marker.AdvancedMarkerElement({ map: gMapRef.current, position: { lat: la, lng: ln }, content: el, gmpDraggable: true });
        markerRef.current.addListener('dragend', (e: any) => onChange(e.latLng.lat(), e.latLng.lng()));
      }
    } catch { /* silent */ }
    finally { setSearching(false); }
  }, [search, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {GMAPS_KEY ? (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') geocodeSearch(); }}
              placeholder="Search location…"
              className="input"
              style={{ flex: 1, fontSize: 12 }}
            />
            <button type="button" onClick={geocodeSearch} disabled={searching} className="btn btn-sm btn-ghost" style={{ gap: 4 }}>
              <MapPin size={12} /> {searching ? '…' : 'Go'}
            </button>
          </div>
          <div ref={mapRef} style={{ height: 260, border: '1px solid hsl(var(--border))' }} />
          <p style={{ fontSize: 11, color: 'hsl(var(--muted-fg))', display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={11} style={{ color: 'hsl(var(--primary))' }} />
            Search or click the map · drag the pin to adjust
          </p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'hsl(var(--muted-fg))' }}>
          Add <code style={{ fontFamily: 'var(--font-mono)', color: 'hsl(var(--primary))' }}>VITE_GOOGLE_MAPS_API_KEY</code> to enable map picker.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', display: 'block', marginBottom: 4 }}>Latitude</label>
          <input type="number" step="any" className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            value={lat || ''} placeholder="0.000000"
            onChange={e => onChange(parseFloat(e.target.value) || 0, lng)} />
        </div>
        <div>
          <label style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', display: 'block', marginBottom: 4 }}>Longitude</label>
          <input type="number" step="any" className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            value={lng || ''} placeholder="0.000000"
            onChange={e => onChange(lat, parseFloat(e.target.value) || 0)} />
        </div>
      </div>
    </div>
  );
}
