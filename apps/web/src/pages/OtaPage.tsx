import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Package, CheckCircle2, Clock, AlertCircle, Trash2, Archive,
  RotateCcw, Star, AlertTriangle, X, ChevronDown, ChevronUp, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

type FirmwareStatus = 'active' | 'deprecated' | 'archived' | 'ready';
type JobStatus = 'in_progress' | 'completed' | 'failed' | 'pending';

interface Firmware {
  id: string;
  name: string;
  version: string;
  category: string;
  size: string;
  status: FirmwareStatus;
  uploadedAt: string;
  devices: number;
  changelog?: string;
}

interface Job {
  id: string;
  name: string;
  firmware: string;
  firmwareId: string;
  status: JobStatus;
  progress: number;
  total: number;
  started: string;
}

const INITIAL_FIRMWARE: Firmware[] = [
  { id: '1', name: 'Tracker Firmware',    version: '2.4.1', category: 'tracker',       size: '248 KB', status: 'active',     uploadedAt: '2024-03-10', devices: 12, changelog: 'Improved GPS accuracy, reduced power consumption by 15%.' },
  { id: '2', name: 'Tracker Firmware',    version: '2.3.0', category: 'tracker',       size: '241 KB', status: 'deprecated', uploadedAt: '2024-01-22', devices:  3, changelog: 'Added geofencing support.' },
  { id: '3', name: 'Env Sensor',          version: '1.8.0', category: 'environmental', size: '124 KB', status: 'active',     uploadedAt: '2024-03-05', devices:  4, changelog: 'CO2 sensor calibration fix.' },
  { id: '4', name: 'Gateway OS',          version: '3.1.2', category: 'gateway',       size: '1.2 MB', status: 'ready',      uploadedAt: '2024-02-28', devices:  2, changelog: 'Security patch for CVE-2024-0012.' },
  { id: '5', name: 'Gateway OS',          version: '3.0.5', category: 'gateway',       size: '1.1 MB', status: 'archived',   uploadedAt: '2023-11-10', devices:  0, changelog: 'Legacy version — archived.' },
];

const INITIAL_JOBS: Job[] = [
  { id: '1', name: 'Fleet Tracker Update', firmware: 'v2.4.1', firmwareId: '1', status: 'in_progress', progress: 7,  total: 12, started: '2024-03-11T09:00:00Z' },
  { id: '2', name: 'Env Sensor Rollout',   firmware: 'v1.8.0', firmwareId: '3', status: 'completed',   progress: 4,  total: 4,  started: '2024-03-06T14:30:00Z' },
  { id: '3', name: 'Gateway Update',       firmware: 'v3.1.2', firmwareId: '4', status: 'failed',      progress: 1,  total: 2,  started: '2024-03-01T11:00:00Z' },
];

const STATUS_CONFIG: Record<FirmwareStatus, { badge: string; label: string; icon: any }> = {
  active:     { badge: 'badge-online',   label: 'Active',     icon: CheckCircle2  },
  ready:      { badge: 'badge-info',     label: 'Ready',      icon: Package       },
  deprecated: { badge: 'badge-warning',  label: 'Deprecated', icon: AlertTriangle },
  archived:   { badge: 'badge-offline',  label: 'Archived',   icon: Archive       },
};

const JOB_CONFIG: Record<JobStatus, { badge: string; icon: any }> = {
  in_progress: { badge: 'badge-warning', icon: Clock       },
  completed:   { badge: 'badge-online',  icon: CheckCircle2 },
  failed:      { badge: 'badge-error',   icon: AlertCircle },
  pending:     { badge: 'badge-info',    icon: Clock       },
};

/* ── Upload Modal ────────────────────────────────────────────────── */
function UploadModal({ onClose, onUpload }: { onClose: () => void; onUpload: (fw: Firmware) => void }) {
  const [name, setName]     = useState('');
  const [version, setVersion] = useState('');
  const [category, setCat]  = useState('tracker');
  const [file, setFile]     = useState<File | null>(null);
  const [notes, setNotes]   = useState('');

  const submit = () => {
    if (!name || !version || !file) { toast.error('Fill all required fields'); return; }
    const fw: Firmware = {
      id: Date.now().toString(),
      name, version, category,
      size: file.size > 1_000_000 ? `${(file.size / 1_048_576).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`,
      status: 'ready',
      uploadedAt: new Date().toISOString().split('T')[0],
      devices: 0,
      changelog: notes,
    };
    onUpload(fw);
    toast.success('Firmware uploaded successfully');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="relative bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Upload size={15} className="text-primary" />
            </div>
            <h2 className="text-[15px] font-semibold text-foreground">Upload Firmware</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm !px-2"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Name *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tracker Firmware" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Version *</label>
              <input className="input" value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. 2.5.0" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Category</label>
            <select className="select" value={category} onChange={e => setCat(e.target.value)}>
              {['tracker','environmental','industrial','energy','water','gateway','custom'].map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Firmware File *</label>
            <label className={cn(
              'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors',
              file ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-border-strong'
            )}>
              <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} accept=".bin,.hex,.elf,.fw" />
              {file ? (
                <>
                  <CheckCircle2 size={20} className="text-primary" />
                  <span className="text-[13px] font-medium text-foreground">{file.name}</span>
                  <span className="text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                </>
              ) : (
                <>
                  <Upload size={20} className="text-muted-foreground" />
                  <span className="text-[13px] text-muted-foreground">Drop file or click to browse</span>
                  <span className="text-[11px] text-muted-foreground">.bin · .hex · .elf · .fw</span>
                </>
              )}
            </label>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Changelog / Notes</label>
            <textarea
              className="textarea"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What changed in this release?"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-surface-raised">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={submit} className="btn btn-primary">
            <Upload size={14} /> Upload
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Deploy Modal ────────────────────────────────────────────────── */
function DeployModal({ fw, onClose, onDeploy }: { fw: Firmware; onClose: () => void; onDeploy: (jobName: string) => void }) {
  const [jobName, setJobName] = useState(`${fw.name} v${fw.version} Rollout`);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="relative bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-foreground">Deploy Firmware</h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm !px-2"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-muted rounded-xl p-3 text-[13px] text-foreground">
            <span className="text-muted-foreground">Deploying</span> {fw.name} <strong>v{fw.version}</strong>
            {' '}to <strong>{fw.devices}</strong> device{fw.devices !== 1 ? 's' : ''}
          </div>
          <div>
            <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Job Name</label>
            <input className="input" value={jobName} onChange={e => setJobName(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-surface-raised">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={() => { onDeploy(jobName); onClose(); }} className="btn btn-primary">Start Rollout</button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Firmware Card ───────────────────────────────────────────────── */
function FirmwareCard({
  fw, onStatusChange, onDelete, onDeploy,
}: {
  fw: Firmware;
  onStatusChange: (id: string, status: FirmwareStatus) => void;
  onDelete: (id: string) => void;
  onDeploy: (fw: Firmware) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[fw.status];
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
      className="border border-border rounded-xl overflow-hidden"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Package size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-semibold text-foreground">{fw.name}</p>
                <span className="text-[12px] font-mono text-muted-foreground">v{fw.version}</span>
                <span className={`badge ${cfg.badge} gap-1`}><StatusIcon size={9} /> {cfg.label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {fw.size} · {fw.category} · {fw.uploadedAt} · {fw.devices} device{fw.devices !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setExpanded(v => !v)}
              className="btn btn-ghost btn-sm !px-1.5 flex-shrink-0 text-muted-foreground"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {fw.changelog && (
                <div className="bg-muted rounded-xl p-3 text-[12px] text-muted-foreground leading-relaxed">
                  {fw.changelog}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {fw.status !== 'archived' && fw.status !== 'deprecated' && (
                  <button onClick={() => onDeploy(fw)} className="btn btn-primary btn-sm">
                    <Upload size={12} /> Deploy
                  </button>
                )}
                {fw.status === 'active' && (
                  <button
                    onClick={() => { onStatusChange(fw.id, 'deprecated'); toast.success('Marked as deprecated'); }}
                    className="btn btn-secondary btn-sm"
                  >
                    <AlertTriangle size={12} /> Mark Deprecated
                  </button>
                )}
                {fw.status === 'deprecated' && (
                  <button
                    onClick={() => { onStatusChange(fw.id, 'active'); toast.success('Marked as active'); }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Star size={12} /> Mark Active
                  </button>
                )}
                {fw.status !== 'archived' && (
                  <button
                    onClick={() => { onStatusChange(fw.id, 'archived'); toast.success('Firmware archived'); }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Archive size={12} /> Archive
                  </button>
                )}
                {fw.status === 'archived' && (
                  <button
                    onClick={() => { onStatusChange(fw.id, 'ready'); toast.success('Firmware restored'); }}
                    className="btn btn-secondary btn-sm"
                  >
                    <RotateCcw size={12} /> Restore
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!confirm(`Delete ${fw.name} v${fw.version}? This cannot be undone.`)) return;
                    onDelete(fw.id);
                    toast.success('Firmware deleted');
                  }}
                  className="btn btn-sm bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */
export function OtaPage() {
  const [firmware, setFirmware] = useState<Firmware[]>(INITIAL_FIRMWARE);
  const [jobs, setJobs]         = useState<Job[]>(INITIAL_JOBS);
  const [showUpload, setShowUpload] = useState(false);
  const [deployTarget, setDeployTarget] = useState<Firmware | null>(null);
  const [filter, setFilter] = useState<FirmwareStatus | 'all'>('all');

  const handleStatusChange = (id: string, status: FirmwareStatus) =>
    setFirmware(f => f.map(fw => fw.id === id ? { ...fw, status } : fw));

  const handleDelete = (id: string) =>
    setFirmware(f => f.filter(fw => fw.id !== id));

  const handleUpload = (fw: Firmware) =>
    setFirmware(f => [fw, ...f]);

  const handleDeploy = (jobName: string) => {
    if (!deployTarget) return;
    const newJob: Job = {
      id: Date.now().toString(),
      name: jobName,
      firmware: `v${deployTarget.version}`,
      firmwareId: deployTarget.id,
      status: 'pending',
      progress: 0,
      total: deployTarget.devices || 1,
      started: new Date().toISOString(),
    };
    setJobs(j => [newJob, ...j]);
    toast.success('Rollout job created');
  };

  const handleRollback = (job: Job) => {
    toast.success(`Rollback initiated for ${job.name}`);
  };

  const filtered = firmware.filter(fw => filter === 'all' || fw.status === filter);

  const activeCount     = firmware.filter(f => f.status === 'active').length;
  const inProgressCount = jobs.filter(j => j.status === 'in_progress' || j.status === 'pending').length;
  const completedCount  = jobs.filter(j => j.status === 'completed').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Firmware</h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">Manage firmware versions and OTA update rollouts</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn btn-primary">
          <Upload size={14} /> Upload Firmware
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Package,      label: 'Firmware Versions', value: firmware.length,  accent: 'bg-primary/10 text-primary' },
          { icon: Clock,        label: 'Active Jobs',        value: inProgressCount,  accent: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
          { icon: CheckCircle2, label: 'Completed Jobs',     value: completedCount,   accent: 'bg-green-500/10 text-green-600 dark:text-green-400' },
        ].map(({ icon: Icon, label, value, accent }) => (
          <div key={label} className="card p-5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${accent}`}><Icon size={17} /></div>
            <p className="text-[1.5rem] font-semibold text-foreground tracking-tight">{value}</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
        {/* Firmware library */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold text-foreground">Firmware Library</span>
            <div className="flex gap-1">
              {(['all', 'active', 'ready', 'deprecated', 'archived'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'text-[11px] px-2.5 py-1 rounded-lg capitalize transition-all',
                    filter === f ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 space-y-2">
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-[13px] text-muted-foreground">
                  No firmware in this category
                </div>
              ) : (
                filtered.map(fw => (
                  <FirmwareCard
                    key={fw.id}
                    fw={fw}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onDeploy={setDeployTarget}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Update jobs */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold text-foreground">Update Jobs</span>
          </div>
          <div className="divide-y divide-border/50">
            {jobs.map((job) => {
              const cfg = JOB_CONFIG[job.status] ?? JOB_CONFIG.pending;
              const Icon = cfg.icon;
              const pct = Math.round((job.progress / job.total) * 100);
              return (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground truncate">{job.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {job.firmware} · {job.progress}/{job.total} devices
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className={`badge ${cfg.badge} gap-1`}><Icon size={9} /> {job.status.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={cn(
                        'h-full rounded-full',
                        job.status === 'failed'      ? 'bg-red-500' :
                        job.status === 'completed'   ? 'bg-green-500' :
                        job.status === 'in_progress' ? 'bg-primary' : 'bg-border-strong'
                      )}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">{pct}% complete</p>
                    {(job.status === 'failed' || job.status === 'completed') && (
                      <button
                        onClick={() => handleRollback(job)}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw size={10} /> Rollback
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {jobs.length === 0 && (
              <div className="py-10 text-center text-[13px] text-muted-foreground">No jobs yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUpload={handleUpload} />}
      </AnimatePresence>
      <AnimatePresence>
        {deployTarget && (
          <DeployModal
            fw={deployTarget}
            onClose={() => setDeployTarget(null)}
            onDeploy={handleDeploy}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
