import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import apiClient from '@/api/client';
import { cn, timeAgo, formatDate, categoryIcon, generateChartColor } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { ArrowLeft, Activity, MapPin, Cpu, RefreshCw, Key, Terminal, Wifi, WifiOff, AlertCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

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
    return <div className="p-6"><div className="skeleton h-8 w-48 mb-4 rounded-lg" /></div>;
  }

  if (!device) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">Device not found</p>
        <Link to="/devices" className="btn-primary mt-4 inline-flex">← Back to devices</Link>
      </div>
    );
  }

  const d = device as any;
  const fields = liveFields && Object.keys(liveFields).length > 0 ? liveFields : latestTelemetry?.fields ?? {};

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Breadcrumb + header */}
      <div className="flex items-start gap-4">
        <Link to="/devices" className="btn-ghost mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xl">{categoryIcon(d.category)}</span>
            <h1 className="text-xl font-bold text-slate-100">{d.name}</h1>
            <span className={cn('badge',
              d.status === 'online' ? 'badge-online' :
              d.status === 'error' ? 'badge-error' : 'badge-offline'
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5',
                d.status === 'online' ? 'bg-emerald-400' :
                d.status === 'error' ? 'bg-rose-400' : 'bg-slate-500'
              )} />
              {d.status}
            </span>
          </div>
          <p className="text-sm text-slate-500 ml-10">
            {d.category} · {d.protocol?.toUpperCase()} · Last seen {d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'never'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-border">
        <nav className="flex gap-1">
          {(['overview', 'telemetry', 'commands', 'location', 'config'] as TabId[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('px-4 py-2.5 text-sm font-medium transition-colors border-b-2',
                tab === t
                  ? 'text-orion-300 border-orion-500'
                  : 'text-slate-400 hover:text-slate-200 border-transparent'
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab device={d} fields={fields} latestTs={latestTelemetry?.timestamp} />}
      {tab === 'telemetry' && <TelemetryTab deviceId={id!} />}
      {tab === 'commands' && <CommandsTab deviceId={id!} commands={commands?.data ?? []} />}
      {tab === 'location' && <LocationTab deviceId={id!} device={d} />}
      {tab === 'config' && <ConfigTab device={d} />}
    </div>
  );
}

function OverviewTab({ device, fields, latestTs }: { device: any; fields: any; latestTs?: string }) {
  const entries = Object.entries(fields).filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Device info */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">Device Info</h3>
        {[
          { label: 'Category', value: device.category },
          { label: 'Protocol', value: device.protocol?.toUpperCase() },
          { label: 'Format', value: device.payloadFormat?.toUpperCase() },
          { label: 'Serial #', value: device.serialNumber || '—' },
          { label: 'Firmware', value: device.firmwareVersion || '—' },
          { label: 'First seen', value: device.firstSeenAt ? formatDate(device.firstSeenAt) : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-200 font-medium capitalize">{value}</span>
          </div>
        ))}
        {device.tags?.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1">
              {device.tags.map((t: string) => <span key={t} className="badge-primary text-[11px]">{t}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* Live telemetry fields */}
      <div className="lg:col-span-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">Live Telemetry</h3>
            {latestTs && <span className="text-xs text-slate-500">{timeAgo(latestTs)}</span>}
          </div>
          {entries.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">No telemetry received yet</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {entries.map(([key, value], i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 1 }}
                  className="bg-surface-1 rounded-xl p-4 border border-surface-border"
                >
                  <p className="text-xs text-slate-500 mb-1 truncate">{key}</p>
                  <p className="text-lg font-bold" style={{ color: generateChartColor(i) }}>
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

function TelemetryTab({ deviceId }: { deviceId: string }) {
  const [field, setField] = useState('temperature');
  const [range, setRange] = useState('24h');

  const hoursMap: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
  const from = new Date(Date.now() - hoursMap[range] * 3600_000).toISOString();
  const to = new Date().toISOString();

  const { data: seriesData } = useQuery({
    queryKey: ['series', deviceId, field, range],
    queryFn: () => telemetryApi.series(deviceId, field, from, to, 500),
  });

  const points = seriesData?.data ?? [];

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1b31',
      borderColor: '#2a2b45',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (p: any) => p[0] ? `${p[0].axisValue}<br/><b>${p[0].value[1]}</b>` : '',
    },
    grid: { left: '2%', right: '2%', bottom: 20, top: 20, containLabel: true },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#475569', fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    },
    yAxis: {
      axisLabel: { color: '#475569', fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: '#1f2040' } },
    },
    series: [{
      type: 'line', smooth: true, symbol: 'none',
      data: points.map((p: any) => [new Date(p.ts).getTime(), typeof p.value === 'number' ? parseFloat(p.value.toFixed(3)) : p.value]),
      lineStyle: { width: 2, color: '#6272f2' },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: '#6272f230' }, { offset: 1, color: '#6272f205' }],
        },
      },
    }],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={field}
          onChange={e => setField(e.target.value)}
          placeholder="Field name (e.g. temperature)"
          className="input-field max-w-xs"
        />
        <div className="flex items-center gap-1 bg-surface-3 rounded-lg p-1">
          {['1h', '6h', '24h', '7d'].map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn('text-xs px-3 py-1.5 rounded-md transition-colors',
                range === r ? 'bg-orion-600 text-white' : 'text-slate-400 hover:text-slate-200'
              )}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <ReactECharts option={option} style={{ height: 300 }} notMerge />
      </div>
      <div className="card overflow-hidden">
        <div className="p-3 border-b border-surface-border">
          <p className="text-xs font-medium text-slate-400">Recent data points ({points.length})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Timestamp</th><th>{field}</th></tr></thead>
            <tbody>
              {points.slice(-20).reverse().map((p: any, i: number) => (
                <tr key={i}>
                  <td className="text-slate-400 font-mono text-xs">{formatDate(p.ts)}</td>
                  <td className="font-medium">{typeof p.value === 'number' ? p.value.toFixed(3) : String(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Send Command</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Command Name</label>
            <input value={cmdName} onChange={e => setCmdName(e.target.value)} className="input-field" placeholder="e.g. reboot, get_status" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Payload (JSON)</label>
            <input value={cmdPayload} onChange={e => setCmdPayload(e.target.value)} className="input-field font-mono" placeholder="{}" />
          </div>
        </div>
        <button onClick={sendCommand} disabled={sending || !cmdName} className="btn-primary mt-3">
          <Terminal className="w-4 h-4" />
          {sending ? 'Sending...' : 'Send Command'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-surface-border">
          <h3 className="text-sm font-semibold text-slate-200">Command History</h3>
        </div>
        {commands.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No commands sent yet</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Command</th><th>Status</th><th>Sent</th><th>Response</th></tr></thead>
            <tbody>
              {commands.map((cmd: any) => (
                <tr key={cmd._id}>
                  <td>
                    <span className="font-mono text-sm text-orion-300">{cmd.name}</span>
                  </td>
                  <td>
                    <span className={cn('badge',
                      cmd.status === 'executed' ? 'badge-online' :
                      cmd.status === 'failed' ? 'badge-error' :
                      cmd.status === 'sent' ? 'badge-info' : 'badge-offline'
                    )}>{cmd.status}</span>
                  </td>
                  <td className="text-xs text-slate-500">{timeAgo(cmd.createdAt)}</td>
                  <td className="text-xs text-slate-500 font-mono">
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

function LocationTab({ deviceId, device }: { deviceId: string; device: any }) {
  return (
    <div className="space-y-4">
      {device.location?.lat ? (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Last Known Position</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Latitude', value: device.location.lat?.toFixed(6) },
              { label: 'Longitude', value: device.location.lng?.toFixed(6) },
              { label: 'Altitude', value: device.location.alt ? `${device.location.alt?.toFixed(1)} m` : '—' },
              { label: 'Speed', value: device.location.speed ? `${device.location.speed?.toFixed(1)} km/h` : '—' },
              { label: 'Heading', value: device.location.heading ? `${device.location.heading?.toFixed(0)}°` : '—' },
              { label: 'Updated', value: device.location.timestamp ? timeAgo(device.location.timestamp) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-3 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-sm font-semibold text-slate-200">{value}</p>
              </div>
            ))}
          </div>
          <Link to="/map" className="btn-secondary mt-4 inline-flex">
            <MapPin className="w-4 h-4" /> View on Map
          </Link>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400">No location data available</p>
          <p className="text-xs text-slate-600 mt-1">This device has not sent location data yet</p>
        </div>
      )}
    </div>
  );
}

function ConfigTab({ device }: { device: any }) {
  const queryClient = useQueryClient();
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [currentKey, setCurrentKey] = useState(device.apiKey);

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
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Device API Key</h3>
        <div className="flex items-center gap-2">
          <input
            type={apiKeyVisible ? 'text' : 'password'}
            value={currentKey}
            readOnly
            className="input-field font-mono text-xs flex-1"
          />
          <button onClick={() => setApiKeyVisible(!apiKeyVisible)} className="btn-ghost px-2">
            {apiKeyVisible ? '🙈' : '👁'}
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(currentKey); toast.success('Copied!'); }}
            className="btn-secondary px-3"
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">Use this key in the <code className="font-mono bg-surface-3 px-1 rounded">X-API-Key</code> header when sending data</p>
        <button onClick={regenerate} className="btn-ghost mt-3 text-rose-400 hover:text-rose-300">
          <Key className="w-3.5 h-3.5" /> Regenerate Key
        </button>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Ingestion Example</h3>
        <pre className="bg-surface-1 rounded-xl p-4 text-xs font-mono text-slate-400 overflow-x-auto">
{`curl -X POST https://orion.vortan.io/api/v1/telemetry/ingest \\
  -H "X-API-Key: ${currentKey?.slice(0, 20)}..." \\
  -H "Content-Type: application/json" \\
  -d '{"temperature": 24.3, "humidity": 65.1}'`}
        </pre>
      </div>
    </div>
  );
}
