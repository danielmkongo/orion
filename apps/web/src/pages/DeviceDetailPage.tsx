import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import apiClient from '@/api/client';
import { timeAgo, formatDate as fmtDate, getCategoryIconInfo } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { LineChart } from '@/components/charts/Charts';
import { ArrowLeft, Eye, EyeOff, Copy, RefreshCw, Terminal } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import toast from 'react-hot-toast';
import L from 'leaflet';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--info))', 'hsl(var(--good))', 'hsl(var(--warn))', '#A06CD5', '#06B6D4'];

function SatelliteMap({ lat, lng }: { lat: number; lng: number }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 18 }
    ).addTo(map);
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:22px;height:22px;border-radius:99px;background:hsl(var(--primary));box-shadow:0 0 0 4px rgba(255,91,31,.25),0 0 0 1px #fff;position:relative"><div style="position:absolute;inset:6px;background:#fff;border-radius:99px"></div></div>`,
      iconSize: [22, 22], iconAnchor: [11, 11],
    });
    L.marker([lat, lng], { icon }).addTo(map);
    map.setView([lat, lng], 13);
    leafletRef.current = map;
    return () => { map.remove(); leafletRef.current = null; };
  }, [lat, lng]);
  return <div ref={mapRef} style={{ width: '100%', height: 320, border: '1px solid hsl(var(--border))' }} />;
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [liveFields, setLiveFields] = useState<Record<string, any>>({});
  const [chartField, setChartField] = useState('');
  const [chartRange, setChartRange] = useState('24h');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [currentKey, setCurrentKey] = useState('');
  const [cmdName, setCmdName] = useState('');
  const [cmdPayload, setCmdPayload] = useState('{}');
  const [sending, setSending] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const { on, subscribeDevice } = useSocket();
  const queryClient = useQueryClient();

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesApi.get(id!),
    enabled: !!id,
  });

  const { data: latestTelemetry } = useQuery({
    queryKey: ['telemetry', 'latest', id],
    queryFn: () => telemetryApi.latest(id!),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const { data: commands } = useQuery({
    queryKey: ['commands', id],
    queryFn: () => apiClient.get('/commands', { params: { deviceId: id, limit: 20 } }).then(r => r.data),
    enabled: !!id,
    refetchInterval: 60_000,
  });

  const hoursMap: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
  const from = new Date(Date.now() - (hoursMap[chartRange] ?? 24) * 3600_000).toISOString();
  const to   = new Date().toISOString();

  const { data: seriesData } = useQuery({
    queryKey: ['series', id, chartField, chartRange],
    queryFn: () => telemetryApi.series(id!, chartField, from, to, 500),
    enabled: !!id && !!chartField,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!id) return;
    const unsub  = subscribeDevice(id);
    const unsubT = on('telemetry.update', (event: any) => {
      if (event.deviceId === id || event.data?.deviceId === id) {
        setLiveFields(event.data?.fields ?? {});
        queryClient.invalidateQueries({ queryKey: ['telemetry', 'latest', id] });
      }
    });
    return () => { unsub(); unsubT(); };
  }, [id, on, subscribeDevice, queryClient]);

  const d = device as any;
  const fields = liveFields && Object.keys(liveFields).length > 0 ? liveFields : latestTelemetry?.fields ?? {};
  const numericFields = Object.entries(fields).filter(([, v]) => typeof v === 'number') as [string, number][];
  const allFields     = Object.entries(fields) as [string, any][];

  useEffect(() => {
    if (!chartField && numericFields.length > 0) setChartField(numericFields[0][0]);
  }, [numericFields.length]); // eslint-disable-line

  useEffect(() => { if (d?.apiKey) setCurrentKey(d.apiKey); }, [d?.apiKey]);

  const seriesPoints = (seriesData?.data ?? []).map((p: any) => ({
    ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
    value: typeof p.value === 'number' ? p.value : 0,
  }));

  const { Icon: CatIcon } = d ? getCategoryIconInfo(d.category) : { Icon: () => null };

  const sendCommand = async () => {
    if (!cmdName.trim()) return;
    setSending(true);
    try {
      let payload = {};
      try { payload = JSON.parse(cmdPayload); } catch {}
      await apiClient.post('/commands', { deviceId: id, name: cmdName, payload });
      toast.success('Command sent');
      setCmdName(''); setCmdPayload('{}');
      queryClient.invalidateQueries({ queryKey: ['commands', id] });
    } catch { toast.error('Failed to send command'); }
    finally { setSending(false); }
  };

  const regenerateKey = async () => {
    try {
      const { apiKey } = await devicesApi.regenerateKey(d._id);
      setCurrentKey(apiKey);
      toast.success('API key regenerated');
    } catch { toast.error('Failed to regenerate key'); }
  };

  if (isLoading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );
  }
  if (!d) {
    return (
      <div className="page">
        <p className="dim" style={{ textAlign: 'center', padding: '64px 0' }}>Device not found</p>
      </div>
    );
  }

  return (
    <div className="page">
      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Link to="/devices" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          <ArrowLeft size={13} /> Devices
        </Link>
        <span className="mono faint" style={{ fontSize: 10.5 }}>/</span>
        <span className="mono faint" style={{ fontSize: 10.5 }}>{d.category}</span>
      </div>

      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="eyebrow">{d.category} · {d.protocol?.toUpperCase()}</span>
            <span className={`tag tag-${d.status === 'online' ? 'online' : d.status === 'error' ? 'error' : d.status === 'idle' ? 'warn' : 'offline'}`}>
              <span className={`dot dot-${d.status === 'idle' ? 'warn' : d.status}`} />
              {d.status}
            </span>
            {latestTelemetry?.timestamp && (
              <span className="mono faint" style={{ fontSize: 11 }}>Last seen {timeAgo(latestTelemetry.timestamp)}</span>
            )}
          </div>
          <h1>
            {d.name.split(' ').slice(0, -1).join(' ')} <em>{d.name.split(' ').slice(-1)[0]}</em>
          </h1>
          <p className="lede">
            {d.description || `${d.category} · Firmware ${d.firmwareVersion ?? '—'} · ${d.lastSeenAt ? `Last seen ${timeAgo(d.lastSeenAt)}` : 'Never connected'}`}
          </p>
        </div>
        <div style={{ gridColumn: 3, display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 20 }}>
          <button className="btn btn-sm" style={{ gap: 6 }} onClick={() => { setCmdName('get_status'); }}>
            <Terminal size={13} /> Send command
          </button>
          <button className="btn btn-sm btn-outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['device', id] })}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── Live metrics grid ── */}
      {numericFields.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          borderTop: '1px solid hsl(var(--fg))',
          marginBottom: 32,
        }}>
          {numericFields.map(([k, v], i) => (
            <button
              key={k}
              onClick={() => setChartField(k)}
              style={{
                padding: `18px 20px 18px ${i % 4 === 0 ? 0 : 20}px`,
                borderBottom: '1px solid hsl(var(--border))',
                borderRight: (i + 1) % 4 !== 0 ? '1px solid hsl(var(--border))' : 'none',
                textAlign: 'left',
                background: chartField === k ? 'hsl(var(--surface-raised))' : 'transparent',
                cursor: 'pointer',
                outline: chartField === k ? `1px solid ${COLORS[i % COLORS.length]}` : 'none',
                outlineOffset: -1,
                transition: 'background 0.1s',
              }}
            >
              <div className="eyebrow" style={{ fontSize: 9.5 }}>{k.replace(/_/g, ' ')}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em', marginTop: 4, color: COLORS[i % COLORS.length] }} className="num">
                {v.toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Section I: Telemetry chart + device info ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32, marginBottom: 0 }}>
        {/* Chart */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow">Live telemetry</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1, marginTop: 4, textTransform: 'capitalize' }}>
                {chartField.replace(/_/g, ' ')} <span style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>· {chartRange}</span>
              </div>
            </div>
            <div className="seg">
              {['1h', '6h', '24h', '7d'].map(r => (
                <button key={r} className={chartRange === r ? 'on' : ''} onClick={() => setChartRange(r)}>{r.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="panel" style={{ padding: '16px 12px 8px' }}>
            {seriesPoints.length === 0 ? (
              <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">
                No data for <strong style={{ marginLeft: 4, fontFamily: 'var(--font-mono)' }}>{chartField}</strong>
              </div>
            ) : (
              <LineChart series={[{ name: chartField, data: seriesPoints, color: 'hsl(var(--primary))' }]} height={280} showArea />
            )}
          </div>
        </div>

        {/* Device info */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Device info</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Category',   d.category,                            ''],
              ['Protocol',   d.protocol?.toUpperCase(),             'mono'],
              ['Format',     d.payloadFormat?.toUpperCase() ?? '—', 'mono'],
              ['Serial',     d.serialNumber ?? '—',                 'mono'],
              ['Firmware',   d.firmwareVersion ?? '—',              'mono'],
              ['First seen', d.firstSeenAt ? fmtDate(d.firstSeenAt) : '—', ''],
              ['Tags',       d.tags?.join(', ') || '—',             ''],
            ].map(([label, value, cls]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                <span className="mono faint" style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
                <span className={cls} style={{ fontSize: 13, textTransform: cls === '' ? 'capitalize' : 'none' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* API key */}
          <div className="eyebrow" style={{ marginTop: 24, marginBottom: 8 }}>API key</div>
          <div className="panel" style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type={apiKeyVisible ? 'text' : 'password'}
                value={currentKey || '••••••••••••••••'}
                readOnly
                className="input mono"
                style={{ flex: 1, fontSize: 11.5, height: 32 }}
              />
              <button onClick={() => setApiKeyVisible(v => !v)} className="btn btn-sm btn-icon">
                {apiKeyVisible ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(currentKey); toast.success('Copied!'); }}
                className="btn btn-sm btn-icon"
              >
                <Copy size={12} />
              </button>
            </div>
            <button onClick={() => setShowRegenConfirm(true)} className="dim" style={{ marginTop: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--bad))', padding: 0 }}>
              <RefreshCw size={10} /> Regenerate
            </button>
          </div>
        </div>
      </div>

      {/* ── Section IV: Location ── */}
      <div className="section">
        <div>
          <div className="ssh">Location</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '28ch' }}>
            Live position on satellite imagery.
          </p>
          {d.location?.lat && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16, fontSize: 13 }}>
              {[
                ['Lat',  d.location.lat?.toFixed(6)],
                ['Lng',  (d.location.lng ?? d.location.lon)?.toFixed(6)],
                d.location.alt   ? ['Alt',     `${d.location.alt?.toFixed(1)} m`]         : null,
                d.location.speed ? ['Speed',   `${d.location.speed?.toFixed(1)} km/h`]    : null,
              ].filter(Boolean).map(([k, v]: any) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="mono faint" style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{k}</span>
                  <span className="mono" style={{ fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          {d.location?.lat ? (
            <SatelliteMap lat={d.location.lat} lng={d.location.lng ?? d.location.lon ?? 0} />
          ) : (
            <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
              <p className="dim" style={{ fontSize: 13 }}>No location data for this device.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Section V: Commands ── */}
      <div className="section">
        <div>
          <div className="ssh">Controls</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '28ch' }}>
            Send a command to this device. Each gesture sends the matching payload.
          </p>
        </div>
        <div>
          {/* Send form */}
          <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Send command</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Command</label>
                <input
                  value={cmdName}
                  onChange={e => setCmdName(e.target.value)}
                  className="input mono"
                  placeholder="reboot, get_status…"
                />
              </div>
              <div>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Payload (JSON)</label>
                <input
                  value={cmdPayload}
                  onChange={e => setCmdPayload(e.target.value)}
                  className="input mono"
                  placeholder="{}"
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>
            <button onClick={sendCommand} disabled={sending || !cmdName.trim()} className="btn btn-primary" style={{ gap: 6 }}>
              <Terminal size={13} />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>

          {/* Command history */}
          <div className="eyebrow" style={{ marginBottom: 8 }}>Command history</div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                {(commands?.data ?? []).length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px 0' }} className="dim">No commands sent yet</td></tr>
                ) : (
                  (commands?.data ?? []).map((cmd: any) => (
                    <tr key={cmd._id}>
                      <td className="mono acc" style={{ fontSize: 12 }}>{cmd.name}</td>
                      <td>
                        <span className={`tag tag-${cmd.status === 'executed' ? 'online' : cmd.status === 'failed' ? 'error' : 'offline'}`}>
                          {cmd.status}
                        </span>
                      </td>
                      <td className="mono faint" style={{ fontSize: 11 }}>{timeAgo(cmd.createdAt)}</td>
                      <td className="mono faint" style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cmd.errorMessage ?? (cmd.response ? JSON.stringify(cmd.response).slice(0, 60) : '—')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Section VI: Quick integration ── */}
      <div className="section">
        <div>
          <div className="ssh">Integration</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '28ch' }}>
            Ingest telemetry via HTTP with your device API key.
          </p>
        </div>
        <div>
          <pre className="panel" style={{ padding: '14px 16px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', overflowX: 'auto', lineHeight: 1.6 }}>
{`curl -X POST https://orion.vortan.io/api/v1/telemetry/ingest \\
  -H "X-API-Key: ${currentKey?.slice(0, 16) || '<api-key>'}..." \\
  -H "Content-Type: application/json" \\
  -d '{"temperature": 24.3, "humidity": 65}'`}
          </pre>
          <p className="dim" style={{ fontSize: 11, marginTop: 8 }}>
            Include as <span className="mono acc">X-API-Key</span> header.
            <button
              className="acc"
              style={{ marginLeft: 8, background: 'none', border: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => { navigator.clipboard.writeText(currentKey); toast.success('Copied!'); }}
            >
              <Copy size={10} /> Copy key
            </button>
          </p>
        </div>
      </div>

      {showRegenConfirm && (
        <ConfirmModal
          title="Regenerate API key"
          message="The existing key will stop working immediately. Any devices using it will need to be updated."
          confirmLabel="Regenerate"
          danger
          onConfirm={() => { setShowRegenConfirm(false); regenerateKey(); }}
          onCancel={() => setShowRegenConfirm(false)}
        />
      )}
    </div>
  );
}
