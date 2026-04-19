import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, RefreshCw, Cpu, Trash2, ExternalLink, MoreHorizontal } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { timeAgo, getCategoryIconInfo } from '@/lib/utils';
import { DeviceForm } from '@/components/devices/DeviceForm';
import toast from 'react-hot-toast';
import type { Device } from '@orion/shared';

const STATUS_COLOR: Record<string, string> = {
  online:       '#22C55E',
  error:        '#EF4444',
  idle:         '#F59E0B',
  provisioning: '#FF6A30',
  offline:      '#6B7280',
  decommissioned: '#6B7280',
};

const CATEGORIES = ['all', 'environmental', 'industrial', 'energy', 'water', 'tracker', 'gateway', 'research', 'custom'];
const STATUSES   = ['all', 'online', 'offline', 'error', 'idle'];

export function DevicesPage() {
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus]     = useState('all');
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices', { search, category, status }],
    queryFn: () => devicesApi.list({
      search:   search   || undefined,
      category: category !== 'all' ? category : undefined,
      status:   status   !== 'all' ? status   : undefined,
      limit: 100,
    }),
  });

  const deleteMut = useMutation({
    mutationFn: devicesApi.delete,
    onSuccess: () => { toast.success('Device deleted'); queryClient.invalidateQueries({ queryKey: ['devices'] }); },
    onError:   () => toast.error('Failed to delete device'),
  });

  const devices = data?.devices ?? [];
  const total   = data?.total   ?? 0;

  function confirmDelete(d: Device) {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    deleteMut.mutate(d.id ?? (d as any)._id);
  }

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 pt-1 flex-wrap">
        <div>
          <p className="eyebrow text-[9px] mb-2">Fleet Management</p>
          <h1 className="text-[26px] leading-none tracking-tight text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            <em>Devices</em>
          </h1>
          <p className="text-[12px] text-muted-foreground mt-1.5 font-mono">
            {isLoading ? 'Loading…' : `${total} device${total !== 1 ? 's' : ''} registered`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn btn-secondary btn-sm" title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowForm(true)} className="btn btn-primary gap-1.5">
            <Plus size={13} /> Add Device
          </button>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input !pl-9"
            placeholder="Search devices…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-px border border-[hsl(var(--rule))] self-start">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-[11px] font-mono capitalize transition-colors ${status === s ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        {/* Category chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1 text-[11px] font-mono capitalize border transition-colors ${
                category === c
                  ? 'border-primary text-primary bg-primary/[0.07]'
                  : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground hover:border-foreground/20'
              }`}
            >
              {c === 'all' ? 'All categories' : c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <div className="border border-[hsl(var(--rule))]">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-10 bg-muted animate-pulse" />)}
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Cpu size={24} className="text-muted-foreground/30 mb-4" />
            <p className="text-[14px] font-semibold text-foreground">No devices found</p>
            <p className="text-[12px] text-muted-foreground mt-1 mb-5">
              {search || category !== 'all' || status !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first device to get started'}
            </p>
            {!search && category === 'all' && status === 'all' && (
              <button onClick={() => setShowForm(true)} className="btn btn-primary gap-1.5">
                <Plus size={13} /> Add Device
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Category</th>
                <th>Protocol</th>
                <th>Last Seen</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device: any) => (
                <DeviceRow
                  key={device._id ?? device.id}
                  device={device}
                  onDelete={() => confirmDelete(device)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showForm && <DeviceForm onClose={() => setShowForm(false)} />}
      </AnimatePresence>
    </div>
  );
}

function DeviceRow({ device, onDelete }: { device: any; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const id = device._id ?? device.id;
  const { Icon: CatIcon, color: catColor } = getCategoryIconInfo(device.category);
  const sc = STATUS_COLOR[device.status] ?? '#6B7280';

  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0" style={{ color: catColor }}>
            <CatIcon size={13} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground leading-tight">{device.name}</p>
            {device.description && (
              <p className="text-[11px] text-muted-foreground truncate max-w-[160px] font-mono">{device.description}</p>
            )}
          </div>
        </div>
      </td>
      <td>
        <span className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color: sc }}>
          <span className="w-1.5 h-1.5 flex-shrink-0" style={{ backgroundColor: sc }} />
          {device.status}
        </span>
      </td>
      <td>
        <span className="font-mono text-[11px] text-muted-foreground capitalize">{device.category}</span>
      </td>
      <td>
        <span className="font-mono text-[11px] text-muted-foreground uppercase">{device.protocol}</span>
      </td>
      <td>
        <span className="font-mono text-[11px] text-muted-foreground">
          {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'Never'}
        </span>
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          <Link to={`/devices/${id}`} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="View">
            <ExternalLink size={12} />
          </Link>
          <div className="relative">
            <button
              onClick={() => setOpen(v => !v)}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <MoreHorizontal size={13} />
            </button>
            <AnimatePresence>
              {open && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 top-full mt-1 w-36 bg-[hsl(var(--surface))] border border-[hsl(var(--rule))] shadow-xl z-20 py-1"
                  >
                    <Link
                      to={`/devices/${id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-foreground hover:bg-muted transition-colors"
                    >
                      <ExternalLink size={12} /> View details
                    </Link>
                    <button
                      onClick={() => { onDelete(); setOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </td>
    </tr>
  );
}
