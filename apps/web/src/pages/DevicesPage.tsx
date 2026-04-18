import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, Filter, RefreshCw, Cpu, MapPin, Activity, Trash2, Edit, MoreVertical } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { cn, timeAgo, categoryIcon, statusColor } from '@/lib/utils';
import toast from 'react-hot-toast';

const CATEGORIES = ['all', 'tracker', 'environmental', 'energy', 'water', 'pump', 'gateway', 'mobile', 'research', 'industrial', 'custom'];
const STATUSES = ['all', 'online', 'offline', 'idle', 'error', 'provisioning'];

export function DevicesPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices', { search, category, status }],
    queryFn: () => devicesApi.list({
      search: search || undefined,
      category: category !== 'all' ? category : undefined,
      status: status !== 'all' ? status : undefined,
      limit: 100,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: devicesApi.delete,
    onSuccess: () => {
      toast.success('Device deleted');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: () => toast.error('Failed to delete device'),
  });

  const devices = data?.devices ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Devices</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} device{total !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-ghost" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Device
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search devices..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="input-field w-auto pr-8"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="input-field w-auto pr-8"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {/* Device grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-xl" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="card p-16 text-center">
          <Cpu className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No devices found</p>
          <p className="text-sm text-slate-600 mt-1">Add your first device to get started</p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">
            <Plus className="w-4 h-4" /> Add Device
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {devices.map((device: any, i: number) => (
            <motion.div
              key={device._id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <DeviceCard device={device} onDelete={() => deleteMutation.mutate(device._id)} />
            </motion.div>
          ))}
        </div>
      )}

      {showAddModal && <AddDeviceModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

function DeviceCard({ device, onDelete }: { device: any; onDelete: () => void }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="card group hover:border-surface-border-strong transition-all duration-150 overflow-hidden">
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={cn('status-dot',
              device.status === 'online' ? 'status-dot-online' :
              device.status === 'error' ? 'status-dot-error' :
              device.status === 'idle' ? 'status-dot-idle' : 'status-dot-offline'
            )} />
            <span className="text-xs text-slate-400 capitalize">{device.status}</span>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-surface-3 transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-7 w-36 bg-surface-2 border border-surface-border rounded-xl shadow-elevated z-10 overflow-hidden py-1"
                onMouseLeave={() => setShowMenu(false)}
              >
                <Link
                  to={`/devices/${device._id}`}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-surface-3 hover:text-slate-100"
                >
                  <Edit className="w-3.5 h-3.5" /> View & Edit
                </Link>
                <button
                  onClick={() => { onDelete(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Device icon + name */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-surface-3 rounded-xl flex items-center justify-center text-lg">
            {categoryIcon(device.category)}
          </div>
          <div className="flex-1 min-w-0">
            <Link
              to={`/devices/${device._id}`}
              className="text-sm font-semibold text-slate-200 hover:text-orion-300 truncate block transition-colors"
            >
              {device.name}
            </Link>
            <p className="text-xs text-slate-500 capitalize">{device.category}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="space-y-1.5">
          {device.location?.lat && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="w-3 h-3" />
              {device.location.lat.toFixed(4)}, {device.location.lng.toFixed(4)}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Activity className="w-3 h-3" />
            {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'Never seen'}
          </div>
        </div>

        {/* Tags */}
        {device.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {device.tags.slice(0, 3).map((tag: string) => (
              <span key={tag} className="badge-primary text-[10px] px-1.5 py-0.5">{tag}</span>
            ))}
          </div>
        )}
      </div>

      <Link
        to={`/devices/${device._id}`}
        className="flex items-center justify-between px-4 py-2.5 bg-surface-1/50 border-t border-surface-border/50 text-xs text-slate-500 hover:text-orion-400 hover:bg-surface-3/50 transition-colors"
      >
        <span>View details</span>
        <span>→</span>
      </Link>
    </div>
  );
}

function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '', category: 'telemetry', protocol: 'http', payloadFormat: 'json',
    description: '', serialNumber: '', tags: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await devicesApi.create({
        ...form,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
      } as any);
      toast.success('Device created successfully');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      onClose();
    } catch {
      toast.error('Failed to create device');
    } finally {
      setLoading(false);
    }
  };

  const update = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg bg-surface-2 border border-surface-border rounded-2xl shadow-elevated overflow-hidden"
      >
        <div className="p-5 border-b border-surface-border flex items-center justify-between">
          <h2 className="font-semibold text-slate-200">Add New Device</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Device Name *</label>
              <input value={form.name} onChange={update('name')} className="input-field" placeholder="Temperature Sensor #1" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Category</label>
              <select value={form.category} onChange={update('category')} className="input-field">
                {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Protocol</label>
              <select value={form.protocol} onChange={update('protocol')} className="input-field">
                {['http', 'mqtt', 'websocket', 'tcp', 'udp', 'coap'].map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Payload Format</label>
              <select value={form.payloadFormat} onChange={update('payloadFormat')} className="input-field">
                {['json', 'csv', 'xml', 'raw', 'msgpack', 'cbor', 'protobuf'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Serial Number</label>
              <input value={form.serialNumber} onChange={update('serialNumber')} className="input-field" placeholder="SN-001" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
              <textarea value={form.description} onChange={update('description')} className="input-field resize-none" rows={2} placeholder="Optional description" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Tags (comma-separated)</label>
              <input value={form.tags} onChange={update('tags')} className="input-field" placeholder="production, site-a, outdoor" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Creating...' : 'Create Device'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
