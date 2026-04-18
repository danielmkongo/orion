import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, RefreshCw, Cpu, Trash2, ExternalLink, MoreHorizontal, Filter } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { timeAgo, categoryIcon } from '@/lib/utils';
import { DeviceForm } from '@/components/devices/DeviceForm';
import toast from 'react-hot-toast';
import type { Device } from '@orion/shared';

const STATUS_BADGE: Record<string, string> = {
  online:       'badge-online',
  offline:      'badge-offline',
  error:        'badge-error',
  idle:         'badge-idle',
  provisioning: 'badge-provisioning',
  decommissioned:'badge-offline',
};

const CATEGORIES = ['all', 'environmental', 'industrial', 'energy', 'water', 'tracker', 'gateway', 'research', 'custom'];

export function DevicesPage() {
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('all');
  const [status, setStatus]       = useState('all');
  const [showForm, setShowForm]   = useState(false);
  const [showFilters, setFilters] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices', { search, category, status }],
    queryFn: () => devicesApi.list({
      search:   search  || undefined,
      category: category !== 'all' ? category  : undefined,
      status:   status  !== 'all' ? status   : undefined,
      limit: 100,
    }),
  });

  const deleteMut = useMutation({
    mutationFn: devicesApi.delete,
    onSuccess: () => { toast.success('Device deleted'); queryClient.invalidateQueries({ queryKey: ['devices'] }); },
    onError:   () => toast.error('Failed to delete device'),
  });

  const devices = data?.devices ?? [];
  const total   = data?.total ?? 0;

  function confirmDelete(d: Device) {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    deleteMut.mutate(d.id ?? (d as any)._id);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Devices</h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">
            {isLoading ? 'Loading…' : `${total} device${total !== 1 ? 's' : ''} registered`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn btn-secondary btn-sm" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            <Plus size={15} /> Add Device
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input !pl-9"
            placeholder="Search devices…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <button
          onClick={() => setFilters(v => !v)}
          className={`btn btn-secondary gap-1.5 ${showFilters ? 'border-primary/40 text-primary' : ''}`}
        >
          <Filter size={13} /> Filters
          {(category !== 'all' || status !== 'all') && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>

        {/* Status filter pills */}
        {(['all','online','offline','error'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`btn btn-sm capitalize ${status === s ? 'btn-primary' : 'btn-secondary'}`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Extended filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="card p-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-medium text-muted-foreground mr-1">Category:</span>
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 rounded-lg border text-[12px] font-medium transition-all capitalize ${
                    category === c ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground'
                  }`}
                >
                  {c === 'all' ? 'All categories' : c}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="skeleton h-4 w-32 mx-auto mb-2" />
            <div className="skeleton h-4 w-48 mx-auto" />
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Cpu size={22} className="text-muted-foreground" />
            </div>
            <p className="text-[15px] font-semibold text-foreground">No devices found</p>
            <p className="text-[13px] text-muted-foreground mt-1 mb-5">
              {search || category !== 'all' || status !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first device to get started'}
            </p>
            {!search && category === 'all' && status === 'all' && (
              <button onClick={() => setShowForm(true)} className="btn btn-primary">
                <Plus size={14} /> Add Device
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Category</th>
                <th>Status</th>
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

      {/* Add device form modal */}
      <AnimatePresence>
        {showForm && <DeviceForm onClose={() => setShowForm(false)} />}
      </AnimatePresence>
    </div>
  );
}

function DeviceRow({ device, onDelete }: { device: any; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const id = device._id ?? device.id;

  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5">
          <span className="text-[16px]">{categoryIcon(device.category)}</span>
          <div>
            <p className="text-[13px] font-medium text-foreground leading-tight">{device.name}</p>
            {device.description && (
              <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{device.description}</p>
            )}
          </div>
        </div>
      </td>
      <td>
        <span className="text-[12px] text-muted-foreground capitalize">{device.category}</span>
      </td>
      <td>
        <span className={`badge ${STATUS_BADGE[device.status] ?? 'badge-offline'}`}>
          <span className={`status-dot w-1.5 h-1.5 ${device.status === 'online' ? 'status-dot-online' : device.status === 'error' ? 'status-dot-error' : 'status-dot-offline'}`} />
          {device.status}
        </span>
      </td>
      <td>
        <span className="text-[12px] text-muted-foreground uppercase">{device.protocol}</span>
      </td>
      <td>
        <span className="text-[12px] text-muted-foreground">
          {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'Never'}
        </span>
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          <Link to={`/devices/${id}`} className="btn btn-ghost btn-sm !px-0 w-7 h-7" title="View">
            <ExternalLink size={13} />
          </Link>
          <div className="relative">
            <button
              onClick={() => setOpen(v => !v)}
              className="btn btn-ghost btn-sm !px-0 w-7 h-7"
            >
              <MoreHorizontal size={14} />
            </button>
            <AnimatePresence>
              {open && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-full mt-1 w-36 card shadow-card-hover z-20 overflow-hidden py-1"
                  >
                    <Link
                      to={`/devices/${id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-muted transition-colors"
                    >
                      <ExternalLink size={13} /> View details
                    </Link>
                    <button
                      onClick={() => { onDelete(); setOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 size={13} /> Delete
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
