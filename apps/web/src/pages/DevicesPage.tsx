import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Plus, Search, Download, ArrowRight, Trash2 } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { timeAgo } from '@/lib/utils';
import { Sparkline } from '@/components/charts/Charts';
import { DeviceForm } from '@/components/devices/DeviceForm';
import toast from 'react-hot-toast';
import type { Device } from '@orion/shared';

const STATUSES = ['all', 'online', 'idle', 'error', 'offline'];
const CATEGORIES = ['all', 'environmental', 'industrial', 'energy', 'water', 'tracker', 'gateway', 'research', 'custom'];

function sparkData(d: any) {
  return Array.from({ length: 24 }, (_, i) =>
    30 + Math.sin((i + (d.name?.charCodeAt(0) ?? 0)) / 3) * 12 + Math.cos(i / 2) * 5
  );
}

function BatteryBar({ pct }: { pct: number }) {
  const color = pct < 30 ? 'hsl(var(--bad))' : pct < 60 ? 'hsl(var(--warn))' : 'hsl(var(--good))';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '4px', background: 'hsl(var(--border))', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: color }} />
      </div>
      <span className="mono faint" style={{ fontSize: '10.5px', width: '28px', textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export function DevicesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['devices', { search, category, status }],
    queryFn: () => devicesApi.list({
      search: search || undefined,
      category: category !== 'all' ? category : undefined,
      status: status !== 'all' ? status : undefined,
      limit: 100,
    }),
  });

  const deleteMut = useMutation({
    mutationFn: devicesApi.delete,
    onSuccess: () => { toast.success('Device deleted'); queryClient.invalidateQueries({ queryKey: ['devices'] }); },
    onError: () => toast.error('Failed to delete device'),
  });

  const devices = data?.devices ?? [];
  const total = data?.total ?? 0;

  function confirmDelete(e: React.MouseEvent, d: Device) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    deleteMut.mutate((d as any).id ?? (d as any)._id);
  }

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <span className="eyebrow">Inventory · Catalog</span>
          </div>
          <h1>The <em>Fleet</em>.</h1>
          <p className="lede">
            {isLoading ? 'Loading…' : `${devices.length} of ${total} devices.`} Search, filter, and jump into any device for live telemetry, commands, and location.
          </p>
        </div>
        <div style={{ gridColumn: 3, display: 'flex', alignItems: 'flex-end', gap: '8px', paddingBottom: '20px' }}>
          <button className="btn btn-sm" style={{ gap: '6px' }}><Download size={13} /> Export CSV</button>
          <button className="btn btn-primary btn-sm" style={{ gap: '6px' }} onClick={() => setShowForm(true)}>
            <Plus size={13} /> New device
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', padding: '0 12px', height: '38px', flex: '1 1 260px', maxWidth: '420px' }}>
          <Search size={14} style={{ color: 'hsl(var(--muted-fg))', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search devices, codes, sites…"
            style={{ border: 0, outline: 0, background: 'transparent', color: 'hsl(var(--fg))', fontSize: '13px', width: '100%', fontFamily: 'var(--font-sans)' }}
          />
        </div>

        {/* Status segmented */}
        <div className="seg">
          {STATUSES.map(s => (
            <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)} style={{ textTransform: 'capitalize' }}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        {/* Category segmented */}
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)} style={{ textTransform: 'capitalize' }}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="panel table-responsive">
        {isLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--muted-fg))', fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Loading…
          </div>
        ) : devices.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1, marginBottom: '8px' }}>
              No <em style={{ color: 'hsl(var(--primary))' }}>devices</em> found
            </div>
            <p className="dim" style={{ fontSize: '13px', marginBottom: '20px', maxWidth: '36ch' }}>
              {search || category !== 'all' || status !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first device to get started'}
            </p>
            {!search && category === 'all' && status === 'all' && (
              <button className="btn btn-primary" style={{ gap: '6px' }} onClick={() => setShowForm(true)}>
                <Plus size={13} /> New device
              </button>
            )}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>№</th>
                <th>Device</th>
                <th className="hide-sm">Category</th>
                <th>Status</th>
                <th className="hide-sm">Protocol</th>
                <th className="hide-sm">Battery</th>
                <th className="hide-sm">Last 24h</th>
                <th>Last seen</th>
                <th style={{ width: '40px' }} />
              </tr>
            </thead>
            <tbody>
              {(devices as any[]).map((d, i) => {
                const id = d._id ?? d.id;
                const sp = sparkData(d);
                const battery = d.meta?.battery ?? d.battery;
                return (
                  <tr
                    key={id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/devices/${id}`)}
                  >
                    <td className="row-n">{String(i + 1).padStart(2, '0')}</td>
                    <td>
                      <div style={{ fontSize: '13.5px', fontWeight: 500 }}>{d.name}</div>
                      <div className="mono faint" style={{ fontSize: '10.5px', marginTop: '2px' }}>{d.description || d.protocol?.toUpperCase() || ''}</div>
                    </td>
                    <td className="hide-sm dim" style={{ textTransform: 'capitalize', fontSize: '12.5px' }}>{d.category}</td>
                    <td>
                      <span className={`tag tag-${d.status === 'idle' ? 'warn' : d.status === 'online' ? 'online' : d.status === 'error' ? 'error' : 'offline'}`}>
                        <span className={`dot dot-${d.status === 'idle' ? 'warn' : d.status}`} />
                        {d.status}
                      </span>
                    </td>
                    <td className="hide-sm mono" style={{ fontSize: '11px', color: 'hsl(var(--muted-fg))', textTransform: 'uppercase' }}>{d.protocol}</td>
                    <td className="hide-sm" style={{ width: '110px' }}>
                      {battery != null ? <BatteryBar pct={battery} /> : <span className="faint mono" style={{ fontSize: '10.5px' }}>—</span>}
                    </td>
                    <td className="hide-sm" style={{ width: '120px' }}>
                      <Sparkline
                        data={sp}
                        color={d.status === 'error' ? 'hsl(var(--bad))' : d.status === 'online' ? 'hsl(var(--primary))' : 'hsl(var(--muted-fg))'}
                        height={28}
                      />
                    </td>
                    <td className="mono" style={{ fontSize: '11.5px', color: 'hsl(var(--muted-fg))' }}>
                      {d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'Never'}
                    </td>
                    <td onClick={e => confirmDelete(e, d)} style={{ cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}>
                      <Trash2 size={13} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {showForm && <DeviceForm onClose={() => setShowForm(false)} />}
      </AnimatePresence>
    </div>
  );
}
