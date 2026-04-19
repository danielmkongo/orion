import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import apiClient from '@/api/client';
import { cn, timeAgo, formatDate as fmtDate, getCategoryIconInfo, generateChartColor } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { useUIStore } from '@/store/ui.store';
import { ArrowLeft, MapPin, Terminal, Eye, EyeOff, Copy, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

type TabId = 'overview' | 'telemetry' | 'commands' | 'location' | 'config';

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabId>('overview');
  const [liveFields, setLiveFields] = useState<Record<string, any>>({});
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
    enabled: !!id && tab === 'commands',
  });

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Device not found</p>
        <Link to="/devices" className="btn btn-primary">Back to devices</Link>
      </div>
    );
  }

  const d = device as any;
  const { Icon: CatIcon, color: catColor } = getCategoryIconInfo(d.category);
  const fields = liveFields && Object.keys(liveFields).length > 0 ? liveFields : latestTelemetry?.fields ?? {};

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Breadcrumb + header */}
      <div className="flex items-start gap-4">
        <Link to="/devices" className="btn btn-ghost btn-sm mt-0.5 !px-2">
          <ArrowLeft size={15} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${catColor}15` }}>
              <CatIcon size={16} style={{ color: catColor }} />
            </div>
            <h1 className="text-[20px] font-semibold text-foreground">{d.name}</h1>
            <span className={cn('badge',
              d.status === 'online' ? 'badge-online' :
              d.status === 'error'  ? 'badge-error'  : 'badge-offline'
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full mr-1',
                d.status === 'online' ? 'bg-green-500' :
                d.status === 'error'  ? 'bg-red-500'   : 'bg-gray-400'
              )} />
              {d.status}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground ml-11 capitalize">
            {d.category} · {d.protocol?.toUpperCase()} · Last seen {d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'never'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-0.5">
          {(['overview', 'telemetry', 'commands', 'location', 'config'] as TabId[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px',
                tab === t
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'overview'  && <OverviewTab device={d} fields={fields} latestTs={latestTelemetry?.timestamp} />}
      {tab === 'telemetry' && <TelemetryTab deviceId={id!} />}
      {tab === 'commands'  && <CommandsTab deviceId={id!} commands={commands?.data ?? []} />}
      {tab === 'location'  && <LocationTab device={d} />}
      {tab === 'config'    && <ConfigTab device={d} />}
    </div>
  );
}

/* ── Overview ───────────────────────────────────────────────────── */
function OverviewTab({ device, fields, latestTs }: { device: any; fields: any; latestTs?: string }) {
  const entries = Object.entries(fields).filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="card p-5 space-y-3">
        <h3 className="text-[13px] font-semibold text-foreground mb-1">Device Info</h3>
        {[
          { label: 'Category',    value: device.category },
          { label: 'Protocol',    value: device.protocol?.toUpperCase() },
          { label: 'Format',      value: device.payloadFormat?.toUpperCase() },
          { label: 'Serial #',    value: device.serialNumber || '—' },
          { label: 'Firmware',    value: device.firmwareVersion || '—' },
          { label: 'First seen',  value: device.firstSeenAt ? fmtDate(device.firstSeenAt) : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground font-medium capitalize">{value}</span>
          </div>
        ))}
        {device.tags?.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1">
              {device.tags.map((t: string) => (
                <span key={t} className="badge badge-primary text-[11px]">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold text-foreground">Live Telemetry</h3>
            {latestTs && <span className="text-[11px] text-muted-foreground">{timeAgo(latestTs)}</span>}
          </div>
          {entries.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">No telemetry received yet</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {entries.map(([key, value], i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 1 }}
                  className="bg-surface-raised rounded-xl p-4 border border-border"
                >
                  <p className="text-[11px] text-muted-foreground mb-1 truncate capitalize">{key}</p>
                  <p className="text-[18px] font-semibold" style={{ color: generateChartColor(i) }}>
                    {typeof value === 'number' ? value.toFixed(2) : String(value)}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Telemetry ──────────────────────────────────────────────────── */
function TelemetryTab({ deviceId }: { deviceId: string }) {
  const { theme } = useUIStore();
  const isDark = theme === 'dark';
  const [field, setField] = useState('temperature');
  const [range, setRange] = useState('24h');

  const hoursMap: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
  const from = new Date(Date.now() - hoursMap[range] * 3600_000).toISOString();
  const to   = new Date().toISOString();

  const { data: seriesData } = useQuery({
    queryKey: ['series', deviceId, field, range],
    queryFn: () => telemetryApi.series(deviceId, field, from, to, 500),
  });

  const points = seriesData?.data ?? [];

  const labelColor   = isDark ? '#6b7280' : '#9ca3af';
  const splitColor   = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tooltipBg    = isDark ? '#1a1a1a' : '#ffffff';
  const tooltipBorder = isDark ? '#333' : '#e5e7eb';
  const tooltipText  = isDark ? '#f5f5f5' : '#111827';
  const lineColor    = '#ea580c';

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: { color: tooltipText, fontSize: 12 },
    },
    grid: { left: '2%', right: '2%', bottom: 20, top: 20, containLabel: true },
    xAxis: {
      type: 'time',
      axisLabel: { color: labelColor, fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    },
    yAxis: {
      axisLabel: { color: labelColor, fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series: [{
      type: 'line', smooth: true, symbol: 'none',
      data: points.map((p: any) => [new Date(p.ts).getTime(), typeof p.value === 'number' ? parseFloat(p.value.toFixed(3)) : p.value]),
      lineStyle: { width: 2, color: lineColor },
      itemStyle: { color: lineColor },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: `${lineColor}30` }, { offset: 1, color: `${lineColor}05` }],
        },
      },
    }],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={field}
          onChange={e => setField(e.target.value)}
          placeholder="Field name (e.g. temperature)"
          className="input max-w-xs"
        />
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
          {['1h', '6h', '24h', '7d'].map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn(
                'text-[11px] px-3 py-1.5 rounded-lg transition-all',
                range === r
                  ? 'bg-surface text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              )}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="card p-5">
        {points.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-[13px] text-muted-foreground">
            No data for <strong className="mx-1">{field}</strong> in this time range
          </div>
        ) : (
          <ReactECharts option={option} style={{ height: 300 }} notMerge />
        )}
      </div>
      {points.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[12px] font-medium text-muted-foreground">Recent data points ({points.length})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Timestamp</th><th>{field}</th></tr></thead>
              <tbody>
                {points.slice(-20).reverse().map((p: any, i: number) => (
                  <tr key={i}>
                    <td className="font-mono text-[12px]">{fmtDate(p.ts)}</td>
                    <td className="font-medium">{typeof p.value === 'number' ? p.value.toFixed(3) : String(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Commands ───────────────────────────────────────────────────── */
function CommandsTab({ deviceId, commands }: { deviceId: string; commands: any[] }) {
  const queryClient = useQueryClient();
  const [cmdName, setCmdName] = useState('');
  const [cmdPayload, setCmdPayload] = useState('{}');
  const [sending, setSending] = useState(false);

  const sendCommand = async () => {
    if (!cmdName.trim()) return;
    setSending(true);
    try {
      let payload = {};
      try { payload = JSON.parse(cmdPayload); } catch {}
      await apiClient.post('/commands', { deviceId, name: cmdName, payload });
      toast.success('Command sent');
      setCmdName('');
      setCmdPayload('{}');
      queryClient.invalidateQueries({ queryKey: ['commands', deviceId] });
    } catch {
      toast.error('Failed to send command');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-[13px] font-semibold text-foreground mb-4">Send Command</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] text-muted-foreground mb-1.5">Command Name</label>
            <input value={cmdName} onChange={e => setCmdName(e.target.value)} className="input" placeholder="e.g. reboot, get_status" />
          </div>
          <div>
            <label className="block text-[12px] text-muted-foreground mb-1.5">Payload (JSON)</label>
            <input value={cmdPayload} onChange={e => setCmdPayload(e.target.value)} className="input font-mono" placeholder="{}" />
          </div>
        </div>
        <button onClick={sendCommand} disabled={sending || !cmdName} className="btn btn-primary mt-3">
          <Terminal size={14} />
          {sending ? 'Sending…' : 'Send Command'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold text-foreground">Command History</h3>
        </div>
        {commands.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted-foreground">No commands sent yet</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Command</th><th>Status</th><th>Sent</th><th>Response</th></tr></thead>
            <tbody>
              {commands.map((cmd: any) => (
                <tr key={cmd._id}>
                  <td><span className="font-mono text-[13px] text-primary">{cmd.name}</span></td>
                  <td>
                    <span className={cn('badge',
                      cmd.status === 'executed' ? 'badge-online' :
                      cmd.status === 'failed'   ? 'badge-error'  :
                      cmd.status === 'sent'     ? 'badge-info'   : 'badge-offline'
                    )}>{cmd.status}</span>
                  </td>
                  <td className="text-[12px] text-muted-foreground">{timeAgo(cmd.createdAt)}</td>
                  <td className="text-[12px] text-muted-foreground font-mono">
                    {cmd.response ? JSON.stringify(cmd.response).slice(0, 40) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Location ───────────────────────────────────────────────────── */
function LocationTab({ device }: { device: any }) {
  return (
    <div className="space-y-4">
      {device.location?.lat ? (
        <div className="card p-5">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">Last Known Position</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Latitude',  value: device.location.lat?.toFixed(6) },
              { label: 'Longitude', value: device.location.lng?.toFixed(6) },
              { label: 'Altitude',  value: device.location.alt ? `${device.location.alt?.toFixed(1)} m` : '—' },
              { label: 'Speed',     value: device.location.speed ? `${device.location.speed?.toFixed(1)} km/h` : '—' },
              { label: 'Heading',   value: device.location.heading ? `${device.location.heading?.toFixed(0)}°` : '—' },
              { label: 'Updated',   value: device.location.timestamp ? timeAgo(device.location.timestamp) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted rounded-xl p-4">
                <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                <p className="text-[14px] font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <Link to="/map" className="btn btn-secondary mt-4 inline-flex">
            <MapPin size={14} /> View on Map
          </Link>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <MapPin size={24} className="text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-foreground">No location data</p>
          <p className="text-[12px] text-muted-foreground mt-1">This device has not sent location data yet</p>
        </div>
      )}
    </div>
  );
}

/* ── Config ─────────────────────────────────────────────────────── */
function ConfigTab({ device }: { device: any }) {
  const queryClient = useQueryClient();
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [currentKey, setCurrentKey] = useState(device.apiKey ?? '');

  const regenerate = async () => {
    if (!confirm('Regenerate API key? The existing key will stop working immediately.')) return;
    try {
      const { apiKey } = await devicesApi.regenerateKey(device._id);
      setCurrentKey(apiKey);
      toast.success('API key regenerated');
    } catch {
      toast.error('Failed to regenerate key');
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="card p-5">
        <h3 className="text-[13px] font-semibold text-foreground mb-4">Device API Key</h3>
        <div className="flex items-center gap-2">
          <input
            type={apiKeyVisible ? 'text' : 'password'}
            value={currentKey}
            readOnly
            className="input font-mono text-[12px] flex-1"
          />
          <button onClick={() => setApiKeyVisible(v => !v)} className="btn btn-secondary btn-sm !px-2.5">
            {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(currentKey); toast.success('Copied!'); }}
            className="btn btn-secondary btn-sm"
          >
            <Copy size={13} /> Copy
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground mt-2">
          Use this key in the <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-primary text-[11px]">X-API-Key</code> header
        </p>
        <button onClick={regenerate} className="btn btn-ghost mt-3 text-red-500 hover:text-red-600 dark:hover:text-red-400">
          <RefreshCw size={13} /> Regenerate Key
        </button>
      </div>

      <div className="card p-5">
        <h3 className="text-[13px] font-semibold text-foreground mb-3">Ingestion Example</h3>
        <pre className="bg-muted rounded-xl p-4 text-[12px] font-mono text-muted-foreground overflow-x-auto leading-relaxed">
{`curl -X POST https://orion.vortan.io/api/v1/telemetry/ingest \\
  -H "X-API-Key: ${currentKey?.slice(0, 20)}..." \\
  -H "Content-Type: application/json" \\
  -d '{"temperature": 24.3, "humidity": 65.1}'`}
        </pre>
      </div>
    </div>
  );
}
