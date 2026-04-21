import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import apiClient from '@/api/client';
import { timeAgo, formatDate as fmtDate, getCategoryIconInfo, copyText, formatPayloadStr, formatCommandStr } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { ArrowLeft, Eye, EyeOff, Copy, RefreshCw, Terminal, Plus, Trash2, Check, ChevronDown, ChevronRight, Pencil, X, Share2, BarChart2, TableProperties, Globe, ExternalLink, LinkIcon } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import toast from 'react-hot-toast';
import { CommandWidget } from '@/components/devices/CommandWidget';
import type { DeviceCommand } from '@/components/devices/CommandWidget';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--info))', 'hsl(var(--good))', 'hsl(var(--warn))', '#A06CD5', '#06B6D4'];

const API_BASE       = (import.meta as any).env?.VITE_API_URL ?? 'https://orion.vortan.io/api/v1';
const MQTT_BROKER    = (import.meta as any).env?.VITE_MQTT_BROKER ?? '45.79.206.183';
const MQTT_PORT      = (import.meta as any).env?.VITE_MQTT_PORT   ?? '1883';
const TCP_PORT       = (import.meta as any).env?.VITE_TCP_PORT    ?? '8883';
const UDP_PORT       = (import.meta as any).env?.VITE_UDP_PORT    ?? '8884';
const COAP_PORT      = (import.meta as any).env?.VITE_COAP_PORT   ?? '5683';
const API_HOST       = API_BASE.replace(/^https?:\/\//, '').replace(/\/.*/, '').replace(/:.*/, '');

/* ── Google Maps satellite view ─────────────────────────────────────── */
const GMAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? '';
const GMAPS_ID  = (import.meta as any).env?.VITE_GOOGLE_MAP_ID ?? 'DEMO_MAP_ID';

function SatelliteMap({ lat, lng }: { lat: number; lng: number }) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current || !GMAPS_KEY) return;
    // Dynamically load Google Maps if not already present
    const win = window as any;
    const initMap = () => {
      if (!mapRef.current) return;
      const map = new win.google.maps.Map(mapRef.current, {
        center: { lat, lng },
        zoom: 13,
        mapTypeId: 'satellite',
        mapId: GMAPS_ID,
        streetViewControl: false,
        mapTypeControl: false,
        gestureHandling: 'cooperative',
      });
      new win.google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat, lng },
        content: (() => {
          const el = document.createElement('div');
          el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:hsl(var(--primary));border:2px solid white;box-shadow:0 0 0 3px rgba(255,91,31,0.35)';
          return el;
        })(),
      });
    };

    if (win.google?.maps) {
      initMap();
    } else {
      const existing = document.querySelector('script[data-gmaps]');
      if (!existing) {
        const script = document.createElement('script');
        script.dataset.gmaps = '1';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=marker&callback=__gmapsReady`;
        win.__gmapsReady = initMap;
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', initMap);
      }
    }
  }, [lat, lng]);

  if (!GMAPS_KEY) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
        <p className="dim" style={{ fontSize: 13 }}>
          Add <code className="mono acc">VITE_GOOGLE_MAPS_API_KEY</code> to your <code className="mono">.env</code> to enable maps.
        </p>
      </div>
    );
  }

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
  const [showAddCmd, setShowAddCmd] = useState(false);
  const [showRawCmd, setShowRawCmd] = useState(false);
  const [telemView, setTelemView] = useState<'chart' | 'table'>('chart');
  const [shareMode, setShareMode] = useState(false);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [creatingShare, setCreatingShare] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [newCmdName, setNewCmdName] = useState('');
  const [newCmdLabel, setNewCmdLabel] = useState('');
  const [newCmdType, setNewCmdType] = useState<'boolean' | 'number' | 'enum' | 'action' | 'string'>('action');
  const [newCmdMin, setNewCmdMin] = useState(0);
  const [newCmdMax, setNewCmdMax] = useState(100);
  const [newCmdStep, setNewCmdStep] = useState(1);
  const [newCmdUnit, setNewCmdUnit] = useState('');
  const [newCmdValues, setNewCmdValues] = useState('');
  const [savingCmd, setSavingCmd] = useState(false);
  const [editCmds, setEditCmds] = useState(false);
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

  const { data: tableData } = useQuery({
    queryKey: ['telemetry-table', id, chartRange],
    queryFn: () => telemetryApi.query({ deviceId: id!, from, to, limit: 200 }),
    enabled: !!id && telemView === 'table',
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!showSharePanel) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-share-panel]')) setShowSharePanel(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSharePanel]);

  const { data: sharesData, refetch: refetchShares } = useQuery({
    queryKey: ['device-shares', id],
    queryFn: () => apiClient.get('/share').then(r => (r.data.data ?? r.data) as any[]),
    enabled: !!id,
  });
  const existingShare = (sharesData ?? []).find((s: any) => s.type === 'device' && (s.resourceId === id || s.resourceId?._id === id || s.resourceId?.toString() === id));

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

  useEffect(() => {
    if (!chartField && numericFields.length > 0) setChartField(numericFields[0][0]);
  }, [numericFields.length]); // eslint-disable-line

  useEffect(() => { if (d?.apiKey) setCurrentKey(d.apiKey); }, [d?.apiKey]);

  const seriesPoints = (seriesData?.data ?? []).map((p: any) => ({
    ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
    value: typeof p.value === 'number' ? p.value : 0,
  }));

  // Get field metadata from schema for chart color/type
  const schemaFields: any[] = d?.meta?.dataSchema?.fields ?? [];
  const chartFieldMeta = schemaFields.find((f: any) => f.key === chartField);
  const chartColor = chartFieldMeta?.chartColor ?? 'hsl(var(--primary))';

  const { Icon: CatIcon } = d ? getCategoryIconInfo(d.category) : { Icon: () => null };

  const schemaCommands: DeviceCommand[] = d?.meta?.commands ?? [];

  const sendControl = async (name: string, formattedPayload: string) => {
    if (!id) return;
    try {
      let parsed = {};
      try { parsed = JSON.parse(formattedPayload); } catch {}
      await apiClient.post('/commands', { deviceId: id, name, payload: parsed });
      toast.success(`Sent: ${name}`);
      queryClient.invalidateQueries({ queryKey: ['commands', id] });
    } catch { toast.error('Failed to send command'); }
  };

  const toggleSection = (key: string) =>
    setSelectedSections(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const generateShareLink = async () => {
    if (!id || selectedSections.length === 0) return;
    setCreatingShare(true);
    try {
      // Revoke existing share first so we don't accumulate stale links
      if (existingShare?.token) {
        await apiClient.delete(`/share/${existingShare.token}`).catch(() => {});
      }
      const res = await apiClient.post('/share', { type: 'device', resourceId: id, sections: selectedSections });
      const url = `${window.location.origin}/s/${res.data.token}`;
      await copyText(url);
      toast.success('Share link copied to clipboard!');
      setShareMode(false);
      refetchShares();
    } catch { toast.error('Failed to create share link'); }
    finally { setCreatingShare(false); }
  };

  const revokeShareLink = async () => {
    if (!existingShare?.token) return;
    try {
      await apiClient.delete(`/share/${existingShare.token}`);
      toast.success('Share link revoked');
      refetchShares();
      setShowSharePanel(false);
    } catch { toast.error('Failed to revoke share'); }
  };

  const ss = (key: string, content: ReactNode): ReactNode => {
    if (!shareMode) return content;
    const selected = selectedSections.includes(key);
    return (
      <div style={{ position: 'relative', zIndex: 11 }}>
        <div style={{ transition: 'filter 0.25s', filter: selected ? 'none' : 'blur(6px)', pointerEvents: selected ? 'auto' : 'none' }}>
          {content}
        </div>
        {/* Clickable overlay for unselected; badge for selected */}
        <div
          onClick={() => toggleSection(key)}
          style={{
            position: 'absolute', inset: 0, zIndex: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
            padding: 10,
            pointerEvents: 'auto',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: selected ? 'hsl(var(--primary))' : 'hsl(var(--surface) / 0.9)',
            border: `1px solid ${selected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
            padding: '5px 11px', fontSize: 10.5, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em', color: selected ? '#fff' : 'hsl(var(--fg))',
            transition: 'all 0.15s', userSelect: 'none',
          }}>
            <input type="checkbox" checked={selected} readOnly style={{ margin: 0, accentColor: 'hsl(var(--primary))', pointerEvents: 'none' }} />
            {key}
          </div>
        </div>
      </div>
    );
  };

  const sendCommand = async () => {
    if (!cmdName.trim()) return;
    setSending(true);
    try {
      let p = {};
      try { p = JSON.parse(cmdPayload); } catch {}
      await apiClient.post('/commands', { deviceId: id, name: cmdName, payload: p });
      toast.success('Command sent');
      setCmdName(''); setCmdPayload('{}');
      queryClient.invalidateQueries({ queryKey: ['commands', id] });
    } catch { toast.error('Failed to send command'); }
    finally { setSending(false); }
  };

  // Real-time payload preview (respects device payloadFormat)
  const payloadPreview = useMemo(() => {
    if (!cmdName.trim() || !d) return null;
    let value: unknown = cmdPayload;
    try { value = JSON.parse(cmdPayload); } catch {}
    return formatCommandStr(cmdName, typeof value === 'object' ? JSON.stringify(value) : value, d?.payloadFormat ?? 'json');
  }, [cmdName, cmdPayload, d?.payloadFormat]); // eslint-disable-line

  // Live preview for the "Add command" form
  const newCmdPreview = useMemo(() => {
    if (!newCmdName.trim() || !d) return null;
    const sampleValue = newCmdType === 'boolean' ? true
      : newCmdType === 'number' ? newCmdMin
      : newCmdType === 'enum' ? (newCmdValues.split(',')[0]?.trim() || 'option')
      : newCmdType === 'action' ? null
      : 'value';
    return formatCommandStr(newCmdName, sampleValue, d?.payloadFormat ?? 'json');
  }, [newCmdName, newCmdType, newCmdMin, newCmdValues, d?.payloadFormat]); // eslint-disable-line

  const regenerateKey = async () => {
    try {
      const { apiKey } = await devicesApi.regenerateKey(d._id);
      setCurrentKey(apiKey);
      toast.success('API key regenerated');
    } catch { toast.error('Failed to regenerate key'); }
  };

  const saveNewCommand = async () => {
    if (!newCmdName.trim()) { toast.error('Command name required'); return; }
    setSavingCmd(true);
    try {
      const existing: any[] = d.meta?.commands ?? [];
      const newCmd: any = {
        name: newCmdName.trim(),
        label: newCmdLabel.trim() || newCmdName.trim(),
        type: newCmdType,
        ...(newCmdType === 'number' ? { min: newCmdMin, max: newCmdMax, step: newCmdStep, unit: newCmdUnit } : {}),
        ...(newCmdType === 'enum' ? { values: newCmdValues.split(',').map(s => s.trim()).filter(Boolean) } : {}),
      };
      await apiClient.patch(`/devices/${d._id}`, { meta: { ...d.meta, commands: [...existing, newCmd] } });
      toast.success('Command saved');
      queryClient.invalidateQueries({ queryKey: ['device', id] });
      setShowAddCmd(false);
      setNewCmdName(''); setNewCmdLabel(''); setNewCmdType('action'); setNewCmdUnit(''); setNewCmdValues('');
    } catch { toast.error('Failed to save command'); }
    finally { setSavingCmd(false); }
  };

  const removeSchemaCommand = async (idx: number) => {
    try {
      const existing: any[] = d.meta?.commands ?? [];
      await apiClient.patch(`/devices/${d._id}`, { meta: { ...d.meta, commands: existing.filter((_: any, i: number) => i !== idx) } });
      toast.success('Command removed');
      queryClient.invalidateQueries({ queryKey: ['device', id] });
    } catch { toast.error('Failed to remove command'); }
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
          <button className="btn btn-sm" style={{ gap: 6 }} onClick={() => { setShowRawCmd(true); }}>
            <Terminal size={13} /> Send command
          </button>
          {existingShare ? (
            <div style={{ position: 'relative' }}>
              <button
                data-share-panel
                className="btn btn-sm btn-outline"
                style={{ gap: 6, color: 'hsl(var(--good))' }}
                onClick={() => setShowSharePanel(v => !v)}
              >
                <Globe size={13} /> Shared
              </button>
              {showSharePanel && (
                <div data-share-panel style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
                  background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))',
                  minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                    <div className="eyebrow" style={{ fontSize: 9 }}>Active share</div>
                    <div className="mono" style={{ fontSize: 10.5, marginTop: 4, wordBreak: 'break-all', color: 'hsl(var(--muted-fg))' }}>
                      {`${window.location.origin}/s/${existingShare.token}`.slice(0, 44)}…
                    </div>
                    <div className="mono faint" style={{ fontSize: 9, marginTop: 4 }}>
                      Sections: {(existingShare.sections ?? []).join(', ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: 'flex-start', gap: 6, borderRadius: 0, borderBottom: '1px solid hsl(var(--rule-ghost))' }}
                      onClick={async () => {
                        await copyText(`${window.location.origin}/s/${existingShare.token}`);
                        toast.success('Link copied!');
                        setShowSharePanel(false);
                      }}
                    >
                      <Copy size={11} /> Copy link
                    </button>
                    <a
                      href={`/s/${existingShare.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: 'flex-start', gap: 6, borderRadius: 0, borderBottom: '1px solid hsl(var(--rule-ghost))' }}
                      onClick={() => setShowSharePanel(false)}
                    >
                      <ExternalLink size={11} /> View public page
                    </a>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: 'flex-start', gap: 6, borderRadius: 0, borderBottom: '1px solid hsl(var(--rule-ghost))' }}
                      onClick={() => { setShareMode(true); setSelectedSections(existingShare.sections ?? []); setShowSharePanel(false); }}
                    >
                      <LinkIcon size={11} /> Update sections
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: 'flex-start', gap: 6, borderRadius: 0, color: 'hsl(var(--bad))' }}
                      onClick={revokeShareLink}
                    >
                      <Trash2 size={11} /> Revoke link
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button className="btn btn-sm btn-outline" style={{ gap: 6 }} onClick={() => { setShareMode(true); setSelectedSections([]); setShowSharePanel(false); }}>
              <Share2 size={13} /> Share
            </button>
          )}
          <button className="btn btn-sm btn-outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['device', id] })}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── Live metrics grid ── */}
      {numericFields.length > 0 && ss('metrics', <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          borderTop: '1px solid hsl(var(--fg))',
          marginBottom: 32,
        }}>
          {numericFields.map(([k, v], i) => {
            const fMeta = schemaFields.find((f: any) => f.key === k);
            const fColor = fMeta?.chartColor ?? COLORS[i % COLORS.length];
            return (
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
                  outline: chartField === k ? `1px solid ${fColor}` : 'none',
                  outlineOffset: -1,
                  transition: 'background 0.1s',
                }}
              >
                <div className="eyebrow" style={{ fontSize: 9.5 }}>{k.replace(/_/g, ' ')}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em', marginTop: 4, color: fColor }} className="num">
                  {v.toFixed(2)}
                </div>
              </button>
            );
          })}
        </div>)}

      {/* ── Section I: Telemetry chart + device info ── */}
      <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32, marginBottom: 0 }}>
        {/* Chart */}
        {ss('chart', <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow">Live telemetry</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1, marginTop: 4, textTransform: 'capitalize' }}>
                {telemView === 'chart' ? (
                  <>{chartField.replace(/_/g, ' ')} <span style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>· {chartRange}</span></>
                ) : (
                  <>All fields <span style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>· {chartRange}</span></>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="seg">
                <button className={telemView === 'chart' ? 'on' : ''} onClick={() => setTelemView('chart')} title="Chart view">
                  <BarChart2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Chart
                </button>
                <button className={telemView === 'table' ? 'on' : ''} onClick={() => setTelemView('table')} title="Table view">
                  <TableProperties size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Table
                </button>
              </div>
              <div className="seg">
                {['1h', '6h', '24h', '7d'].map(r => (
                  <button key={r} className={chartRange === r ? 'on' : ''} onClick={() => setChartRange(r)}>{r.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="panel" style={{ padding: telemView === 'table' ? 0 : '16px 12px 8px', overflow: 'hidden' }}>
            {telemView === 'table' ? (() => {
              const rows: any[] = tableData?.data ?? [];
              const allFields = schemaFields.length > 0
                ? schemaFields.map((f: any) => f.key)
                : Array.from(new Set(rows.flatMap((r: any) => Object.keys(r.fields ?? {}))));
              if (rows.length === 0) {
                return (
                  <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">
                    No data in this range
                  </div>
                );
              }
              return (
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'hsl(var(--surface-raised))', zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9.5, color: 'hsl(var(--muted-fg))', borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>
                          Timestamp
                        </th>
                        {allFields.map((fk: string) => {
                          const fm = schemaFields.find((f: any) => f.key === fk);
                          const color = fm?.chartColor ?? 'hsl(var(--muted-fg))';
                          return (
                            <th key={fk} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9.5, color, borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>
                              {fk.replace(/_/g, ' ')}{fm?.unit ? ` (${fm.unit})` : ''}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any, i: number) => (
                        <tr key={row._id ?? i} style={{ background: i % 2 === 0 ? 'transparent' : 'hsl(var(--surface-raised) / 0.4)' }}>
                          <td style={{ padding: '7px 12px', color: 'hsl(var(--muted-fg))', whiteSpace: 'nowrap', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                            {new Date(row.ts ?? row.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          {allFields.map((fk: string) => {
                            const val = row.fields?.[fk];
                            const fm = schemaFields.find((f: any) => f.key === fk);
                            const color = fm?.chartColor;
                            return (
                              <td key={fk} style={{ padding: '7px 12px', textAlign: 'right', color: color ?? 'hsl(var(--fg))', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                                {val === undefined || val === null ? <span className="dim">—</span> : typeof val === 'number' ? val.toFixed(2) : String(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })() : (
              seriesPoints.length === 0 ? (
                <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">
                  No data for <strong style={{ marginLeft: 4, fontFamily: 'var(--font-mono)' }}>{chartField}</strong>
                </div>
              ) : (() => {
                const ct = chartFieldMeta?.chartType ?? 'area';
                const latestVal = seriesPoints[seriesPoints.length - 1]?.value ?? 0;
                const minV = chartFieldMeta?.min ?? 0;
                const maxV = chartFieldMeta?.max ?? 100;
                if (ct === 'bar') {
                  const barData = seriesPoints.slice(-40).map(p => ({
                    label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    value: p.value,
                  }));
                  return <BarChart data={barData} color={chartColor} height={280} />;
                }
                if (ct === 'gauge') {
                  const pct = Math.min(100, Math.max(0, ((latestVal - minV) / (maxV - minV)) * 100));
                  const r = 80; const cx = 110; const cy = 110;
                  const start = Math.PI * 0.75; const end = Math.PI * 2.25;
                  const arc = (angle: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
                  const s = arc(start); const e = arc(end);
                  const a = arc(start + (end - start) * (pct / 100));
                  const large = pct > 50 ? 1 : 0;
                  return (
                    <div style={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 220 180" style={{ width: 220, height: 180 }}>
                        <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="hsl(var(--border))" strokeWidth={14} strokeLinecap="round" />
                        {pct > 0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${a.x} ${a.y}`} fill="none" stroke={chartColor} strokeWidth={14} strokeLinecap="round" />}
                        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontSize: 28, fill: 'hsl(var(--fg))' }}>{latestVal.toFixed(1)}</text>
                        <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'hsl(var(--muted-fg))', textTransform: 'uppercase' }}>{chartFieldMeta?.unit ?? chartField}</text>
                        <text x={cx - r - 4} y={cy + 32} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'hsl(var(--muted-fg))' }}>{minV}</text>
                        <text x={cx + r + 4} y={cy + 32} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'hsl(var(--muted-fg))' }}>{maxV}</text>
                      </svg>
                    </div>
                  );
                }
                if (ct === 'level') {
                  const pct = Math.min(100, Math.max(0, ((latestVal - minV) / (maxV - minV)) * 100));
                  return (
                    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
                      <svg viewBox="0 0 60 200" style={{ width: 60, height: 200 }}>
                        <rect x={10} y={10} width={40} height={180} rx={4} fill="hsl(var(--border))" />
                        <rect x={10} y={10 + 180 * (1 - pct / 100)} width={40} height={180 * (pct / 100)} rx={4} fill={chartColor} />
                        <rect x={10} y={10} width={40} height={180} rx={4} fill="none" stroke="hsl(var(--border))" strokeWidth={1.5} />
                      </svg>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, lineHeight: 1, color: chartColor }}>{latestVal.toFixed(1)}</div>
                        <div className="mono faint" style={{ fontSize: 12, marginTop: 4 }}>{chartFieldMeta?.unit ?? chartField}</div>
                        <div className="mono faint" style={{ fontSize: 10, marginTop: 8 }}>{pct.toFixed(0)}% of range</div>
                      </div>
                    </div>
                  );
                }
                if (ct === 'scatter') {
                  return <LineChart series={[{ name: chartField, data: seriesPoints, color: chartColor }]} height={280} showArea={false} />;
                }
                return <LineChart series={[{ name: chartField, data: seriesPoints, color: chartColor }]} height={280} showArea={ct === 'area'} />;
              })()
            )}
          </div>
        </div>)}

        {/* Device info */}
        {ss('info', <div>
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
                onClick={() => copyText(currentKey).then(() => toast.success('Copied!'))}
                className="btn btn-sm btn-icon"
              >
                <Copy size={12} />
              </button>
            </div>
            <button onClick={() => setShowRegenConfirm(true)} className="dim" style={{ marginTop: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--bad))', padding: 0 }}>
              <RefreshCw size={10} /> Regenerate
            </button>
          </div>
        </div>)}
      </div>

      {/* ── Section IV: Location ── */}
      {ss('location', <div className="section">
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
      </div>)}

      {/* ── Section V: Controls ── */}
      <div className="section">
        <div>
          <div className="ssh">Controls</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '28ch' }}>
            Device commands defined in the schema.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 12 }} onClick={() => { setShowAddCmd(v => !v); setEditCmds(false); }}>
              <Plus size={11} /> {showAddCmd ? 'Cancel' : 'Add command'}
            </button>
            {schemaCommands.length > 0 && (
              <button
                className={`btn btn-sm ${editCmds ? 'btn-primary' : 'btn-ghost'}`}
                style={{ gap: 4, fontSize: 12 }}
                onClick={() => setEditCmds(v => !v)}
              >
                {editCmds ? <><X size={11} /> Done</> : <><Pencil size={11} /> Edit</>}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* CommandWidget per schema command */}
          {schemaCommands.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {schemaCommands.map((cmd, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <CommandWidget
                    cmd={cmd}
                    payloadFormat={d.payloadFormat}
                    onSend={sendControl}
                    compact
                  />
                  {editCmds && (
                    <button
                      onClick={() => removeSchemaCommand(idx)}
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 4, color: 'hsl(var(--bad))', fontSize: 11, justifyContent: 'center' }}
                    >
                      <Trash2 size={10} /> Remove "{cmd.label || cmd.name}"
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : !showAddCmd ? (
            <div className="panel" style={{ padding: '32px 24px', textAlign: 'center' }}>
              <p className="dim" style={{ fontSize: 13 }}>No commands defined yet. Click <strong>Add command</strong> to create one.</p>
            </div>
          ) : null}

          {/* Add command form */}
          {showAddCmd && (
            <div className="panel" style={{ padding: 20, borderTop: '2px solid hsl(var(--primary))' }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Add command</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Command name</label>
                    <input className="input mono" style={{ fontSize: 12 }} placeholder="set_temperature" value={newCmdName} onChange={e => setNewCmdName(e.target.value)} />
                  </div>
                  <div>
                    <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Display label</label>
                    <input className="input" style={{ fontSize: 12 }} placeholder="Set Temperature" value={newCmdLabel} onChange={e => setNewCmdLabel(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Control type</label>
                  <select className="select" value={newCmdType} onChange={e => setNewCmdType(e.target.value as any)}>
                    <option value="action">Button</option>
                    <option value="boolean">Toggle (on/off)</option>
                    <option value="number">Slider (value range)</option>
                    <option value="enum">Dropdown (options)</option>
                    <option value="string">Text input</option>
                  </select>
                </div>
                {newCmdType === 'number' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Min', value: newCmdMin, set: setNewCmdMin },
                      { label: 'Max', value: newCmdMax, set: setNewCmdMax },
                      { label: 'Step', value: newCmdStep, set: setNewCmdStep },
                    ].map(({ label, value, set }) => (
                      <div key={label}>
                        <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>{label}</label>
                        <input className="input" type="number" value={value} onChange={e => set(+e.target.value)} />
                      </div>
                    ))}
                    <div>
                      <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Unit</label>
                      <input className="input" placeholder="°C" value={newCmdUnit} onChange={e => setNewCmdUnit(e.target.value)} />
                    </div>
                  </div>
                )}
                {newCmdType === 'enum' && (
                  <div>
                    <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Options (comma-separated)</label>
                    <input className="input" placeholder="low, medium, high" value={newCmdValues} onChange={e => setNewCmdValues(e.target.value)} />
                  </div>
                )}
                {/* Live payload preview */}
                {newCmdPreview && (
                  <div>
                    <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
                      Payload preview · <span className="mono" style={{ color: 'hsl(var(--primary))' }}>{(d.payloadFormat ?? 'json').toUpperCase()}</span>
                    </div>
                    <pre style={{ padding: '8px 12px', fontSize: 10.5, fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0, color: 'hsl(var(--muted-fg))', background: 'hsl(var(--surface-raised))', border: '1px solid hsl(var(--border))' }}>
                      {newCmdPreview}
                    </pre>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveNewCommand} disabled={savingCmd || !newCmdName.trim()} className="btn btn-primary btn-sm" style={{ gap: 4 }}>
                    {savingCmd ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                    Save command
                  </button>
                  <button onClick={() => setShowAddCmd(false)} className="btn btn-ghost btn-sm">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Raw command accordion */}
          <div>
            <button
              onClick={() => setShowRawCmd(v => !v)}
              className="btn btn-ghost btn-sm"
              style={{ gap: 6, fontSize: 12, marginBottom: 8 }}
            >
              {showRawCmd ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Advanced · Raw command
            </button>
            {showRawCmd && (
              <div className="panel" style={{ padding: 20 }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Send raw command</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Command name</label>
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
                {/* Real-time payload preview */}
                {payloadPreview && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>Payload preview</div>
                    <pre className="panel" style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0, color: 'hsl(var(--muted-fg))' }}>
                      {payloadPreview}
                    </pre>
                  </div>
                )}
                <button onClick={sendCommand} disabled={sending || !cmdName.trim()} className="btn btn-primary" style={{ gap: 6 }}>
                  <Terminal size={13} />
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            )}
          </div>

          {/* Command history */}
          {ss('history', <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>History</div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Value sent</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                {(commands?.data ?? []).length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px 0' }} className="dim">No commands sent yet</td></tr>
                ) : (
                  (commands?.data ?? []).map((cmd: any) => {
                    const payloadStr = cmd.payload
                      ? (() => {
                          const entries = Object.entries(cmd.payload);
                          if (entries.length === 0) return '—';
                          if (entries.length === 1) return String(entries[0][1]);
                          return JSON.stringify(cmd.payload).slice(0, 60);
                        })()
                      : '—';
                    return (
                    <tr key={cmd._id}>
                      <td className="mono acc" style={{ fontSize: 12 }}>{cmd.name}</td>
                      <td className="mono" style={{ fontSize: 11, color: 'hsl(var(--primary))', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={cmd.payload ? JSON.stringify(cmd.payload) : undefined}>
                        {payloadStr}
                      </td>
                      <td>
                        {['pending', 'sent', 'acknowledged'].includes(cmd.status) ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                            <svg width="13" height="13" viewBox="0 0 13 13" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
                              <circle cx="6.5" cy="6.5" r="5" fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" />
                              <path d="M 6.5 1.5 A 5 5 0 0 1 11.5 6.5" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            {cmd.status}
                          </span>
                        ) : (
                          <span className={`tag tag-${cmd.status === 'executed' ? 'online' : cmd.status === 'failed' ? 'error' : 'offline'}`}>
                            {cmd.status}
                          </span>
                        )}
                      </td>
                      <td className="mono faint" style={{ fontSize: 11 }}>{timeAgo(cmd.createdAt)}</td>
                      <td className="mono faint" style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cmd.errorMessage ?? (cmd.response ? JSON.stringify(cmd.response).slice(0, 60) : '—')}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>)}
        </div>
      </div>

      {/* ── Section VI: Integration ── */}
      <div className="section">
        <div>
          <div className="ssh">Integration</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '28ch' }}>
            {d.protocol === 'mqtt'      ? 'MQTT broker topics, payload format, and ACK flow.'
              : d.protocol === 'websocket' ? 'WebSocket connection URL, events, and ACK flow.'
              : d.protocol === 'coap'      ? 'CoAP resources for telemetry and command polling.'
              : d.protocol === 'tcp'       ? 'Raw TCP socket protocol — newline-delimited messages.'
              : d.protocol === 'udp'       ? 'UDP datagrams for telemetry (fire-and-forget).'
              : 'HTTP endpoints for telemetry ingest and command polling.'}
          </p>
          <div className="mono faint" style={{ marginTop: 12, fontSize: 10, letterSpacing: '0.12em' }}>
            PROTOCOL · {d.protocol?.toUpperCase() ?? 'HTTP'}<br />
            FORMAT · {d.payloadFormat?.toUpperCase() ?? 'JSON'}<br />
            SERIAL · {d.serialNumber ?? (d as any)._id?.slice(-8) ?? '—'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── MQTT ── */}
          {d.protocol === 'mqtt' && (() => {
            const serial    = d.serialNumber ?? (d as any)._id?.slice(-8) ?? 'device';
            const dataTopic = `/${serial}/data`;
            const cmdTopic  = `/${serial}/commands`;
            const ackTopic  = `/${serial}/commands/{commandId}/ack`;
            const fmt       = d.payloadFormat ?? 'json';
            const dataObj: Record<string, unknown> = {};
            (schemaFields.length > 0 ? schemaFields : [{ key: 'temperature', type: 'number' }, { key: 'humidity', type: 'number' }])
              .forEach((f: any) => { dataObj[f.key] = f.type === 'number' ? 24.3 : f.type === 'boolean' ? false : ''; });
            const dataPayload = formatPayloadStr(dataObj, fmt);
            const brokerUrl = `mqtt://${MQTT_BROKER}:${MQTT_PORT}`;
            const rows = [
              { label: 'PUBLISH · telemetry', topic: dataTopic, color: 'hsl(var(--good))' },
              { label: 'SUBSCRIBE · commands', topic: cmdTopic, color: 'hsl(var(--info))' },
              { label: 'PUBLISH · acknowledge', topic: ackTopic, color: 'hsl(var(--primary))' },
            ];
            return (
              <>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Broker</div>
                  <div className="panel" style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{brokerUrl}</span>
                    <button onClick={() => copyText(brokerUrl).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm btn-icon"><Copy size={10} /></button>
                  </div>
                  <p className="dim" style={{ fontSize: 11, marginTop: 6 }}>
                    Use <code className="mono acc">{serial}</code> as Client ID. Include <code className="mono acc">api_key</code> in every published payload.
                  </p>
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Topics</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {rows.map(r => (
                      <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                        <span className="eyebrow" style={{ fontSize: 9, color: r.color }}>{r.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code className="mono" style={{ fontSize: 11 }}>{r.topic}</code>
                          <button onClick={() => copyText(r.topic).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm btn-icon"><Copy size={10} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="eyebrow">Telemetry payload ({fmt.toUpperCase()})</div>
                    <button onClick={() => copyText(dataPayload).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 11 }}><Copy size={10} /> Copy</button>
                  </div>
                  <pre className="panel" style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.7, margin: 0 }}>{dataPayload}</pre>
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>ACK payload — publish to <code className="mono acc">{ackTopic}</code></div>
                  <pre className="panel" style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.7, margin: 0 }}>
                    {formatPayloadStr({ commandId: '<commandId>', status: 'executed' }, fmt)}
                  </pre>
                </div>
              </>
            );
          })()}

          {/* ── WebSocket ── */}
          {d.protocol === 'websocket' && (() => {
            const wsBase = API_BASE.replace(/^http/, 'ws').replace(/\/api\/v1$/, '');
            const wsUrl  = `${wsBase}/ws?apiKey=${apiKeyVisible ? currentKey : (currentKey?.slice(0, 8) ?? '') + '••••'}`;
            const fmt    = d.payloadFormat ?? 'json';
            const dataObj: Record<string, unknown> = {};
            (schemaFields.length > 0 ? schemaFields : [{ key: 'temperature', type: 'number' }])
              .forEach((f: any) => { dataObj[f.key] = f.type === 'number' ? 24.3 : false; });
            const dataPayload = formatPayloadStr({ type: 'telemetry', ...dataObj }, fmt);
            const cmdPayload  = JSON.stringify({ type: 'command', commandId: '<id>', name: '<cmd>', payload: {} }, null, 2);
            const ackPayload  = JSON.stringify({ type: 'ack', commandId: '<id>', status: 'executed' }, null, 2);
            return (
              <>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Connection URL</div>
                  <div className="panel" style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'hsl(var(--muted-fg))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wsUrl}</span>
                    <button onClick={() => copyText(wsUrl).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm btn-icon" style={{ flexShrink: 0 }}><Copy size={10} /></button>
                  </div>
                  <p className="dim" style={{ fontSize: 11, marginTop: 6 }}>Connect once — apiKey authenticates the session. All messages are newline-terminated JSON.</p>
                </div>
                {[
                  { label: 'SEND · telemetry', dir: '→ server', payload: dataPayload, color: 'hsl(var(--good))' },
                  { label: 'RECEIVE · command', dir: '← server', payload: cmdPayload, color: 'hsl(var(--info))' },
                  { label: 'SEND · acknowledge', dir: '→ server', payload: ackPayload, color: 'hsl(var(--primary))' },
                ].map(row => (
                  <div key={row.label}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="eyebrow" style={{ fontSize: 9, color: row.color }}>{row.label}</span>
                      <span className="mono faint" style={{ fontSize: 9 }}>{row.dir}</span>
                    </div>
                    <pre className="panel" style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.6, margin: 0 }}>{row.payload}</pre>
                  </div>
                ))}
              </>
            );
          })()}

          {/* ── HTTP ── */}
          {(!d.protocol || d.protocol === 'http') && (() => {
            const fmt     = d.payloadFormat ?? 'json';
            const cmdMode = (d as any).meta?.channelConfig?.cmdMode ?? 'poll';
            const maskedKey = apiKeyVisible ? currentKey : `${currentKey?.slice(0, 8) ?? ''}••••••••`;
            const dataObj: Record<string, unknown> = { api_key: maskedKey };
            (schemaFields.length > 0 ? schemaFields : [{ key: 'temperature', type: 'number' }, { key: 'humidity', type: 'number' }])
              .forEach((f: any) => { dataObj[f.key] = f.type === 'number' ? 0 : f.type === 'boolean' ? false : f.type === 'timestamp' ? new Date().toISOString() : ''; });
            const dataPayload = formatPayloadStr(dataObj, fmt);
            const ingestUrl  = `${API_BASE}/telemetry/ingest`;
            const pendingUrl = `${API_BASE}/commands/pending?apiKey=${maskedKey}`;
            const ackUrl     = `${API_BASE}/commands/ack`;
            return (
              <>
                <div className="panel" style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', marginBottom: 4 }}>
                  Command delivery: <span style={{ color: 'hsl(var(--primary))' }}>{cmdMode === 'response' ? 'included in POST response' : 'device polls GET /commands/pending'}</span>
                </div>
                {[
                  { method: 'POST', path: ingestUrl,  note: 'Send telemetry — include api_key in body', color: 'hsl(var(--good))' },
                  ...(cmdMode === 'poll' ? [{ method: 'GET', path: pendingUrl, note: 'Poll for pending commands', color: 'hsl(var(--info))' }] : []),
                  { method: 'POST', path: ackUrl, note: 'Acknowledge: body { commandId, deviceId, status }', color: 'hsl(var(--primary))' },
                ].map(ep => (
                  <div key={ep.path}>
                    <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6, color: ep.color }}>{ep.note}</div>
                    <div className="panel" style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', overflow: 'hidden' }}>
                        <span className="acc" style={{ flexShrink: 0 }}>{ep.method}</span>
                        <span style={{ color: 'hsl(var(--muted-fg))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.path}</span>
                      </div>
                      <button onClick={() => copyText(ep.path).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm btn-icon" style={{ flexShrink: 0 }}><Copy size={10} /></button>
                    </div>
                  </div>
                ))}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="eyebrow">{fmt.toUpperCase()} body</div>
                    <button onClick={() => copyText(dataPayload).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 11 }}><Copy size={10} /> Copy</button>
                  </div>
                  <pre className="panel" style={{ padding: '14px 16px', fontSize: 11, fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.7, margin: 0 }}>{dataPayload}</pre>
                  {cmdMode === 'response' && (
                    <p className="dim" style={{ fontSize: 11, marginTop: 8 }}>
                      When a command is pending, the server appends <code className="mono acc">command</code> to the ingest response body.
                    </p>
                  )}
                </div>
              </>
            );
          })()}

          {/* ── CoAP ── */}
          {d.protocol === 'coap' && (() => {
            const fmt    = d.payloadFormat ?? 'json';
            const maskedKey = apiKeyVisible ? currentKey : `${currentKey?.slice(0, 8) ?? ''}••••`;
            const dataObj: Record<string, unknown> = {};
            (schemaFields.length > 0 ? schemaFields : [{ key: 'temperature', type: 'number' }])
              .forEach((f: any) => { dataObj[f.key] = f.type === 'number' ? 24.3 : false; });
            const dataPayload = formatPayloadStr(dataObj, fmt);
            const base = `coap://${API_HOST}:${COAP_PORT}`;
            const rows = [
              { method: 'POST', path: `${base}/telemetry?apiKey=${maskedKey}`, note: 'Send telemetry — CoAP Confirmable', color: 'hsl(var(--good))' },
              { method: 'GET',  path: `${base}/commands/pending?apiKey=${maskedKey}`, note: 'Poll for pending commands', color: 'hsl(var(--info))' },
              { method: 'POST', path: `${base}/commands/ack?apiKey=${maskedKey}`, note: 'Acknowledge: body { commandId, status }', color: 'hsl(var(--primary))' },
            ];
            return (
              <>
                {rows.map(ep => (
                  <div key={ep.path}>
                    <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6, color: ep.color }}>{ep.note}</div>
                    <div className="panel" style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', overflow: 'hidden' }}>
                        <span className="acc" style={{ flexShrink: 0 }}>{ep.method}</span>
                        <span style={{ color: 'hsl(var(--muted-fg))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.path}</span>
                      </div>
                      <button onClick={() => copyText(ep.path).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm btn-icon" style={{ flexShrink: 0 }}><Copy size={10} /></button>
                    </div>
                  </div>
                ))}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="eyebrow">{fmt.toUpperCase()} payload</div>
                    <button onClick={() => copyText(dataPayload).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 11 }}><Copy size={10} /> Copy</button>
                  </div>
                  <pre className="panel" style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.7, margin: 0 }}>{dataPayload}</pre>
                </div>
              </>
            );
          })()}

          {/* ── TCP ── */}
          {d.protocol === 'tcp' && (() => {
            const fmt = d.payloadFormat ?? 'json';
            const dataObj: Record<string, unknown> = {};
            (schemaFields.length > 0 ? schemaFields : [{ key: 'temperature', type: 'number' }])
              .forEach((f: any) => { dataObj[f.key] = f.type === 'number' ? 24.3 : false; });
            const dataPayload = formatPayloadStr(dataObj, fmt);
            const host = `${API_HOST}:${TCP_PORT}`;
            const session = `# 1. Connect\nnc ${API_HOST} ${TCP_PORT}\n\n# 2. Authenticate (send apiKey then newline)\n${apiKeyVisible ? currentKey : (currentKey?.slice(0,8) ?? '') + '••••'}\n# Server replies: OK\n\n# 3. Send telemetry (one payload per line)\n${dataPayload.replace(/\n/g, ' ')}\n\n# 4. Server pushes commands:\n# CMD:{commandId}:{name and payload JSON}\n\n# 5. Acknowledge\nACK:{commandId}:executed`;
            return (
              <>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Server</div>
                  <div className="panel" style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{host}</span>
                    <button onClick={() => copyText(host).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm btn-icon"><Copy size={10} /></button>
                  </div>
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Session protocol</div>
                  <pre className="panel" style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.8, margin: 0 }}>{session}</pre>
                  <p className="dim" style={{ fontSize: 11, marginTop: 6 }}>Persistent TCP connection. Each line is a message. Telemetry in the device's selected format.</p>
                </div>
              </>
            );
          })()}

          {/* ── UDP ── */}
          {d.protocol === 'udp' && (() => {
            const fmt = d.payloadFormat ?? 'json';
            const dataObj: Record<string, unknown> = {};
            (schemaFields.length > 0 ? schemaFields : [{ key: 'temperature', type: 'number' }])
              .forEach((f: any) => { dataObj[f.key] = f.type === 'number' ? 24.3 : false; });
            const bodyStr = formatPayloadStr(dataObj, fmt).replace(/\n/g, ' ');
            const maskedKey = apiKeyVisible ? currentKey : `${currentKey?.slice(0, 8) ?? ''}••••`;
            const example = `${maskedKey}|${bodyStr}`;
            const host = `${API_HOST}:${UDP_PORT}`;
            return (
              <>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Destination</div>
                  <div className="panel" style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{host} (UDP)</span>
                    <button onClick={() => copyText(host).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm btn-icon"><Copy size={10} /></button>
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="eyebrow">Datagram format</div>
                    <button onClick={() => copyText(example).then(() => toast.success('Copied!'))} className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 11 }}><Copy size={10} /> Copy</button>
                  </div>
                  <pre className="panel" style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{example}</pre>
                  <p className="dim" style={{ fontSize: 11, marginTop: 6 }}>Format: <code className="mono acc">apiKey|payload</code> — send as a single UDP datagram. Commands cannot be delivered over UDP (stateless).</p>
                </div>
              </>
            );
          })()}

        </div>
      </div>

      {/* ── Share mode overlay + bar ── */}
      {shareMode && (
        <>
          <div
            onClick={() => setShareMode(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
            background: 'hsl(var(--surface-raised))', borderTop: '1px solid hsl(var(--border))',
            padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1 }}>
                {selectedSections.length === 0 ? 'Select sections to share' : `${selectedSections.length} section${selectedSections.length > 1 ? 's' : ''} selected`}
              </div>
              {selectedSections.length > 0 && (
                <div className="mono faint" style={{ fontSize: 10.5, marginTop: 4 }}>
                  {selectedSections.join(' · ')}
                </div>
              )}
            </div>
            <button
              onClick={generateShareLink}
              disabled={selectedSections.length === 0 || creatingShare}
              className="btn btn-primary"
              style={{ gap: 6 }}
            >
              <Share2 size={13} />
              {creatingShare ? 'Creating…' : 'Generate link'}
            </button>
            <button onClick={() => setShareMode(false)} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </>
      )}

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
