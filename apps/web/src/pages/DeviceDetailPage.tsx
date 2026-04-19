import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import apiClient from '@/api/client';
import { timeAgo, formatDate as fmtDate, getCategoryIconInfo } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { LineChart } from '@/components/charts/Charts';
import {
  ArrowLeft, Eye, EyeOff, Copy, RefreshCw, Terminal, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import L from 'leaflet';

/* ── Leaflet satellite map ──────────────────────────────────────── */
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
      html: `<div style="width:14px;height:14px;background:#FF6A30;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker([lat, lng], { icon }).addTo(map);
    map.setView([lat, lng], 13);
    leafletRef.current = map;
    return () => { map.remove(); leafletRef.current = null; };
  }, [lat, lng]);

  return <div ref={mapRef} style={{ width: '100%', height: 280 }} />;
}

/* ── main page ───────────────────────────────────────────────────── */
export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [liveFields, setLiveFields] = useState<Record<string, any>>({});
  const [chartField, setChartField] = useState('');
  const [chartRange, setChartRange] = useState('24h');
  const [fieldDropdown, setFieldDropdown] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [currentKey, setCurrentKey] = useState('');
  const [cmdName, setCmdName] = useState('');
  const [cmdPayload, setCmdPayload] = useState('{}');
  const [sending, setSending] = useState(false);
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

  // Subscribe to live telemetry
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeDevice(id);
    const unsubTelemetry = on('telemetry.update', (event: any) => {
      if (event.deviceId === id || event.data?.deviceId === id) {
        setLiveFields(event.data?.fields ?? {});
        queryClient.invalidateQueries({ queryKey: ['telemetry', 'latest', id] });
      }
    });
    return () => { unsub(); unsubTelemetry(); };
  }, [id, on, subscribeDevice, queryClient]);

  const d = device as any;
  const fields = liveFields && Object.keys(liveFields).length > 0 ? liveFields : latestTelemetry?.fields ?? {};
  const numericFields = Object.entries(fields).filter(([, v]) => typeof v === 'number') as [string, number][];
  const allFields     = Object.entries(fields) as [string, any][];

  // Auto-set chart field
  useEffect(() => {
    if (!chartField && numericFields.length > 0) setChartField(numericFields[0][0]);
  }, [numericFields.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (d?.apiKey) setCurrentKey(d.apiKey);
  }, [d?.apiKey]);

  const seriesPoints = (seriesData?.data ?? []).map(p => ({
    ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
    value: typeof p.value === 'number' ? p.value : 0,
  }));

  const { Icon: CatIcon, color: catColor } = d ? getCategoryIconInfo(d.category) : { Icon: () => null, color: '#ea580c' };

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
    if (!confirm('Regenerate API key? The existing key will stop working immediately.')) return;
    try {
      const { apiKey } = await devicesApi.regenerateKey(d._id);
      setCurrentKey(apiKey);
      toast.success('API key regenerated');
    } catch { toast.error('Failed to regenerate key'); }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-36 bg-muted animate-pulse" />
        <div className="h-40 w-full bg-muted animate-pulse" />
      </div>
    );
  }

  if (!d) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Device not found</p>
        <Link to="/devices" className="btn btn-primary">Back to devices</Link>
      </div>
    );
  }

  const statusColor = d.status === 'online' ? '#22C55E' : d.status === 'error' ? '#EF4444' : '#6B7280';

  return (
    <div className="space-y-8 max-w-[1400px]">

      {/* ── Breadcrumb + heading ──────────────────────────────────── */}
      <div className="flex items-start gap-4 pt-1">
        <Link to="/devices" className="mt-1 w-7 h-7 flex items-center justify-center border border-[hsl(var(--rule))] hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0">
          <ArrowLeft size={13} />
        </Link>
        <div className="min-w-0">
          <p className="eyebrow text-[9px] mb-1">Devices / {d.category}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[26px] leading-none tracking-tight text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
              <em>{d.name}</em>
            </h1>
            <span className="flex items-center gap-1.5 font-mono text-[10px] border border-current px-2 py-0.5" style={{ color: statusColor }}>
              <span className="w-1.5 h-1.5" style={{ backgroundColor: statusColor }} />
              {d.status}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1.5 font-mono">
            {d.category} · {d.protocol?.toUpperCase()} · {d.lastSeenAt ? `Last seen ${timeAgo(d.lastSeenAt)}` : 'Never connected'}
          </p>
        </div>
      </div>

      {/* ── Section I — Identity ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ I</span>
          <span className="eyebrow">Identity</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">
          {[
            { label: 'Category',    value: d.category },
            { label: 'Protocol',    value: d.protocol?.toUpperCase() },
            { label: 'Format',      value: d.payloadFormat?.toUpperCase() },
            { label: 'Serial',      value: d.serialNumber || '—' },
            { label: 'Firmware',    value: d.firmwareVersion || '—' },
            { label: 'First seen',  value: d.firstSeenAt ? fmtDate(d.firstSeenAt) : '—' },
            { label: 'Created',     value: d.createdAt ? fmtDate(d.createdAt) : '—' },
            { label: 'Tags',        value: d.tags?.join(', ') || '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[hsl(var(--surface))] px-4 py-3.5">
              <p className="eyebrow text-[9px] mb-1">{label}</p>
              <p className="text-[13px] font-medium text-foreground capitalize font-mono">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section II — Live Telemetry ──────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ II</span>
          <span className="eyebrow">Live Telemetry</span>
          {latestTelemetry?.timestamp && (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">{timeAgo(latestTelemetry.timestamp)}</span>
          )}
        </div>

        {allFields.length === 0 ? (
          <div className="border border-[hsl(var(--rule))] py-12 text-center">
            <p className="text-[13px] text-muted-foreground">No telemetry received yet</p>
          </div>
        ) : (
          <>
            {/* Numeric metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))] mb-4">
              {numericFields.slice(0, 10).map(([key, val], i) => {
                const COLORS = ['#FF6A30','#5B8DEF','#22C55E','#F59E0B','#8B5CF6','#06B6D4'];
                const col = COLORS[i % COLORS.length];
                return (
                  <motion.button
                    key={key}
                    initial={{ opacity: 0.7 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setChartField(key)}
                    className={`bg-[hsl(var(--surface))] px-4 py-3.5 text-left transition-colors hover:bg-[hsl(var(--muted))] ${chartField === key ? 'ring-1 ring-inset ring-primary/30' : ''}`}
                  >
                    <p className="eyebrow text-[9px] mb-1 capitalize">{key}</p>
                    <p className="text-[1.4rem] font-semibold leading-none" style={{ color: col }}>
                      {val.toFixed(2)}
                    </p>
                  </motion.button>
                );
              })}
            </div>

            {/* String/bool fields */}
            {allFields.filter(([, v]) => typeof v !== 'number').length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {allFields.filter(([, v]) => typeof v !== 'number').map(([key, val]) => (
                  <div key={key} className="border border-[hsl(var(--rule))] px-3 py-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">{key}:</span>
                    <span className="font-mono text-[11px] text-foreground ml-1.5">{String(val)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Chart */}
            <div className="border border-[hsl(var(--rule))] bg-[hsl(var(--surface))] p-5">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                {/* Field selector */}
                <div className="relative">
                  <button
                    onClick={() => setFieldDropdown(v => !v)}
                    className="flex items-center gap-2 text-[12px] font-mono border border-[hsl(var(--rule))] px-3 py-1.5 hover:bg-muted transition-colors"
                  >
                    <span className="text-primary">{chartField || 'Select field'}</span>
                    <ChevronDown size={11} className={`transition-transform ${fieldDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {fieldDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setFieldDropdown(false)} />
                      <div className="absolute left-0 top-full mt-1 bg-[hsl(var(--surface))] border border-[hsl(var(--rule))] shadow-xl z-20 min-w-[140px] animate-fade-in">
                        {numericFields.map(([k]) => (
                          <button
                            key={k}
                            onClick={() => { setChartField(k); setFieldDropdown(false); }}
                            className={`w-full px-3 py-2 text-left font-mono text-[11px] hover:bg-muted transition-colors ${k === chartField ? 'text-primary' : 'text-foreground'}`}
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Range */}
                <div className="flex items-center gap-px border border-[hsl(var(--rule))]">
                  {['1h','6h','24h','7d'].map(r => (
                    <button
                      key={r}
                      onClick={() => setChartRange(r)}
                      className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${chartRange === r ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <span className="ml-auto font-mono text-[10px] text-muted-foreground">{seriesPoints.length} points</span>
              </div>

              {seriesPoints.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-[13px] text-muted-foreground">
                  No data for <strong className="mx-1 font-mono">{chartField}</strong> in {chartRange}
                </div>
              ) : (
                <LineChart
                  series={[{ name: chartField, data: seriesPoints, color: '#FF6A30' }]}
                  height={200}
                  showArea
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Section III — Location ────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ III</span>
          <span className="eyebrow">Location</span>
        </div>
        {d.location?.lat ? (
          <div className="border border-[hsl(var(--rule))]">
            <div className="overflow-hidden">
              <SatelliteMap lat={d.location.lat} lng={d.location.lng ?? d.location.lon ?? 0} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-[hsl(var(--rule))] border-t border-[hsl(var(--rule))]">
              {[
                { label: 'Latitude',  value: d.location.lat?.toFixed(6) },
                { label: 'Longitude', value: (d.location.lng ?? d.location.lon)?.toFixed(6) },
                { label: 'Altitude',  value: d.location.alt ? `${d.location.alt?.toFixed(1)} m` : '—' },
                { label: 'Speed',     value: d.location.speed ? `${d.location.speed?.toFixed(1)} km/h` : '—' },
                { label: 'Heading',   value: d.location.heading ? `${d.location.heading?.toFixed(0)}°` : '—' },
                { label: 'Updated',   value: d.location.timestamp ? timeAgo(d.location.timestamp) : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[hsl(var(--surface))] px-4 py-3">
                  <p className="eyebrow text-[9px] mb-1">{label}</p>
                  <p className="font-mono text-[12px] text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="border border-[hsl(var(--rule))] border-dashed py-12 text-center">
            <p className="text-[13px] text-muted-foreground">No location data — device has not sent GPS coordinates</p>
          </div>
        )}
      </div>

      {/* ── Section IV — Commands ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ IV</span>
          <span className="eyebrow">Commands</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">

          {/* Send form */}
          <div className="bg-[hsl(var(--surface))] p-5">
            <p className="text-[12px] font-semibold text-foreground mb-4 uppercase tracking-wider">Send Command</p>
            <div className="space-y-3">
              <div>
                <label className="eyebrow text-[9px] block mb-1.5">Command Name</label>
                <input
                  value={cmdName}
                  onChange={e => setCmdName(e.target.value)}
                  className="input font-mono"
                  placeholder="reboot, get_status, set_mode…"
                />
              </div>
              <div>
                <label className="eyebrow text-[9px] block mb-1.5">Payload (JSON)</label>
                <input
                  value={cmdPayload}
                  onChange={e => setCmdPayload(e.target.value)}
                  className="input font-mono"
                  placeholder="{}"
                />
              </div>
              <button
                onClick={sendCommand}
                disabled={sending || !cmdName.trim()}
                className="btn btn-primary gap-2"
              >
                <Terminal size={13} />
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>

          {/* Command history */}
          <div className="bg-[hsl(var(--surface))]">
            <div className="px-5 py-3 border-b border-[hsl(var(--rule))]">
              <p className="text-[12px] font-semibold text-foreground uppercase tracking-wider">History</p>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {(commands?.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-[12px] text-muted-foreground">No commands sent yet</div>
              ) : (
                (commands?.data ?? []).map((cmd: any) => (
                  <div key={cmd._id} className="flex items-center gap-3 px-5 py-2.5 border-b border-[hsl(var(--rule)/0.5)] last:border-0">
                    <span className="font-mono text-[12px] text-primary flex-1 truncate">{cmd.name}</span>
                    <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${
                      cmd.status === 'executed' ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' :
                      cmd.status === 'failed'   ? 'border-red-500/40 text-red-600 dark:text-red-400' :
                      'border-[hsl(var(--rule))] text-muted-foreground'
                    }`}>{cmd.status}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{timeAgo(cmd.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section V — Configuration ─────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ V</span>
          <span className="eyebrow">Configuration</span>
        </div>
        <div className="border border-[hsl(var(--rule))] bg-[hsl(var(--surface))] p-5 max-w-2xl">
          <p className="eyebrow text-[9px] mb-3">Device API Key</p>
          <div className="flex items-center gap-2">
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={currentKey}
              readOnly
              className="input font-mono text-[12px] flex-1"
            />
            <button onClick={() => setApiKeyVisible(v => !v)} className="btn btn-secondary btn-sm !px-2.5">
              {apiKeyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(currentKey); toast.success('Copied!'); }}
              className="btn btn-secondary btn-sm"
            >
              <Copy size={12} /> Copy
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 font-mono">
            Include as <span className="text-primary">X-API-Key</span> header in your requests
          </p>
          <button
            onClick={regenerateKey}
            className="mt-3 flex items-center gap-1.5 text-[11px] text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <RefreshCw size={11} /> Regenerate key
          </button>

          <div className="mt-5 pt-4 border-t border-[hsl(var(--rule))]">
            <p className="eyebrow text-[9px] mb-2">Quick ingestion example</p>
            <pre className="bg-muted px-4 py-3 text-[11px] font-mono text-muted-foreground overflow-x-auto leading-relaxed">
{`curl -X POST https://orion.vortan.io/api/v1/telemetry/ingest \\
  -H "X-API-Key: ${currentKey?.slice(0, 16) || '<api-key>'}..." \\
  -H "Content-Type: application/json" \\
  -d '{"temperature": 24.3, "humidity": 65}'`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
