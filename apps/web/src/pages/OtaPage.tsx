import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Package, CheckCircle2, AlertCircle, Trash2, Archive,
  RotateCcw, Star, AlertTriangle, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/api/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

type FirmwareStatus = 'active' | 'deprecated' | 'archived' | 'ready';
type JobStatus = 'in_progress' | 'completed' | 'failed' | 'pending';

interface Firmware {
  _id: string;
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
  _id: string;
  name: string;
  firmwareVersion: string;
  firmwareId: string;
  status: JobStatus;
  progress: number;
  total: number;
  startedAt: string;
}

const STATUS_CFG: Record<FirmwareStatus, { tag: string; label: string }> = {
  active:     { tag: 'tag-online',  label: 'Active'     },
  ready:      { tag: 'tag-info',    label: 'Ready'      },
  deprecated: { tag: 'tag-warn',    label: 'Deprecated' },
  archived:   { tag: 'tag-offline', label: 'Archived'   },
};

const JOB_CFG: Record<JobStatus, { tag: string; color: string; label: string }> = {
  in_progress: { tag: 'tag-warn',   color: 'hsl(var(--warn))',    label: 'In Progress' },
  completed:   { tag: 'tag-online', color: 'hsl(var(--good))',    label: 'Completed'   },
  failed:      { tag: 'tag-error',  color: 'hsl(var(--bad))',     label: 'Failed'      },
  pending:     { tag: 'tag-info',   color: 'hsl(var(--primary))', label: 'Pending'     },
};

/* ── Upload Modal ──────────────────────────────────────────────────── */
function UploadModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName]       = useState('');
  const [version, setVersion] = useState('');
  const [category, setCat]    = useState('tracker');
  const [file, setFile]       = useState<File | null>(null);
  const [notes, setNotes]     = useState('');

  const uploadMut = useMutation({
    mutationFn: (body: object) => apiClient.post('/firmware', body).then(r => r.data),
    onSuccess: () => {
      toast.success('Firmware uploaded');
      queryClient.invalidateQueries({ queryKey: ['firmware'] });
      onClose();
    },
    onError: () => toast.error('Failed to upload firmware'),
  });

  const submit = () => {
    if (!name || !version) { toast.error('Fill all required fields'); return; }
    const size = file
      ? file.size > 1_000_000 ? `${(file.size / 1_048_576).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`
      : '0 KB';
    uploadMut.mutate({ name, version, category, size, status: 'ready', changelog: notes, devices: 0, uploadedAt: new Date().toISOString() });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
        className="panel" onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 480, background: 'hsl(var(--surface))', borderTop: '3px solid hsl(var(--primary))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid hsl(var(--border))' }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Upload firmware</span>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={14} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Name *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Tracker Firmware" />
            </div>
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Version *</label>
              <input className="input" value={version} onChange={e => setVersion(e.target.value)} placeholder="2.5.0" />
            </div>
          </div>
          <div>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Category</label>
            <select className="select" value={category} onChange={e => setCat(e.target.value)}>
              {['tracker','environmental','industrial','energy','water','gateway','custom'].map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Firmware file (optional)</label>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, border: `2px dashed ${file ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--border))'}`,
              padding: '24px 16px', cursor: 'pointer',
              background: file ? 'hsl(var(--primary) / 0.04)' : 'transparent',
              transition: 'all 0.15s',
            }}>
              <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} accept=".bin,.hex,.elf,.fw" />
              {file ? (
                <>
                  <CheckCircle2 size={18} style={{ color: 'hsl(var(--primary))' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{file.name}</span>
                  <span className="mono faint" style={{ fontSize: 11 }}>{(file.size / 1024).toFixed(0)} KB</span>
                </>
              ) : (
                <>
                  <Upload size={18} className="faint" />
                  <span className="dim" style={{ fontSize: 13 }}>Drop file or click to browse</span>
                  <span className="mono faint" style={{ fontSize: 11 }}>.bin · .hex · .elf · .fw</span>
                </>
              )}
            </label>
          </div>
          <div>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Changelog / Notes</label>
            <textarea className="textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What changed in this release?" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid hsl(var(--border))' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={uploadMut.isPending} style={{ gap: 6 }}>
            <Upload size={13} /> {uploadMut.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Deploy Modal ──────────────────────────────────────────────────── */
function DeployModal({ fw, onClose }: { fw: Firmware; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [jobName, setJobName] = useState(`${fw.name} v${fw.version} Rollout`);

  const deployMut = useMutation({
    mutationFn: (body: object) => apiClient.post('/ota-jobs', body).then(r => r.data),
    onSuccess: () => {
      toast.success('Rollout job created');
      queryClient.invalidateQueries({ queryKey: ['ota-jobs'] });
      onClose();
    },
    onError: () => toast.error('Failed to create rollout job'),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
        className="panel" onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 400, background: 'hsl(var(--surface))', borderTop: '3px solid hsl(var(--primary))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid hsl(var(--border))' }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Deploy firmware</span>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={14} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '10px 14px', background: 'hsl(var(--bg))', border: '1px solid hsl(var(--border))' }}>
            <p style={{ fontSize: 13 }}>
              <span className="dim">Deploying</span> {fw.name} <strong>v{fw.version}</strong>{' '}
              to <strong>{fw.devices}</strong> device{fw.devices !== 1 ? 's' : ''}
            </p>
          </div>
          <div>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Job name</label>
            <input className="input" value={jobName} onChange={e => setJobName(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid hsl(var(--border))' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={deployMut.isPending}
            onClick={() => deployMut.mutate({ name: jobName, firmwareId: fw._id })}
          >
            {deployMut.isPending ? 'Starting…' : 'Start rollout'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Firmware table row ────────────────────────────────────────────── */
function FirmwareRow({
  fw, onStatusChange, onDelete, onDeploy,
}: {
  fw: Firmware;
  onStatusChange: (id: string, s: FirmwareStatus) => void;
  onDelete: (fw: Firmware) => void;
  onDeploy: (fw: Firmware) => void;
}) {
  const cfg = STATUS_CFG[fw.status] ?? STATUS_CFG.ready;
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Package size={13} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{fw.name}</div>
            {fw.changelog && <div className="dim" style={{ fontSize: 11, marginTop: 1 }}>{fw.changelog}</div>}
          </div>
        </div>
      </td>
      <td><code className="acc mono" style={{ fontSize: 12 }}>v{fw.version}</code></td>
      <td className="mono faint" style={{ fontSize: 11.5 }}>{fw.category}</td>
      <td className="mono faint" style={{ fontSize: 11.5 }}>{fw.size}</td>
      <td className="mono faint" style={{ fontSize: 11.5 }}>{fw.devices}</td>
      <td><span className={`tag ${cfg.tag}`}>{cfg.label}</span></td>
      <td className="mono faint" style={{ fontSize: 11.5 }}>{fw.uploadedAt?.split('T')[0] ?? '—'}</td>
      <td>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          {fw.status !== 'archived' && fw.status !== 'deprecated' && (
            <button onClick={() => onDeploy(fw)} className="btn btn-ghost btn-sm" style={{ fontSize: 11, gap: 4 }}>
              <Upload size={11} /> Deploy
            </button>
          )}
          {fw.status === 'active' && (
            <button onClick={() => onStatusChange(fw._id, 'deprecated')} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} title="Deprecate">
              <AlertTriangle size={11} />
            </button>
          )}
          {fw.status === 'deprecated' && (
            <button onClick={() => onStatusChange(fw._id, 'active')} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} title="Restore">
              <Star size={11} />
            </button>
          )}
          {fw.status !== 'archived' && (
            <button onClick={() => onStatusChange(fw._id, 'archived')} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} title="Archive">
              <Archive size={11} />
            </button>
          )}
          {fw.status === 'archived' && (
            <button onClick={() => onStatusChange(fw._id, 'ready')} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} title="Restore">
              <RotateCcw size={11} />
            </button>
          )}
          <button onClick={() => onDelete(fw)} className="btn btn-ghost btn-sm btn-icon" style={{ color: 'hsl(var(--bad))' }}>
            <Trash2 size={11} />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────── */
export function OtaPage() {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload]     = useState(false);
  const [deployTarget, setDeployTarget] = useState<Firmware | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Firmware | null>(null);
  const [filter, setFilter]             = useState<FirmwareStatus | 'all'>('all');

  const { data: fwData, isLoading: fwLoading } = useQuery({
    queryKey: ['firmware', filter],
    queryFn: () => apiClient.get('/firmware', { params: filter !== 'all' ? { status: filter } : {} }).then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['ota-jobs'],
    queryFn: () => apiClient.get('/ota-jobs').then(r => r.data),
    refetchInterval: 15_000,
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FirmwareStatus }) =>
      apiClient.patch(`/firmware/${id}`, { status }),
    onSuccess: (_, { status }) => {
      toast.success(status === 'archived' ? 'Archived' : status === 'deprecated' ? 'Marked deprecated' : 'Status updated');
      queryClient.invalidateQueries({ queryKey: ['firmware'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/firmware/${id}`),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['firmware'] }); setDeleteTarget(null); },
    onError: () => toast.error('Failed to delete firmware'),
  });

  const firmware: Firmware[] = fwData?.data ?? [];
  const jobs: Job[]          = jobsData?.data ?? [];

  const activeCount     = firmware.filter(f => f.status === 'active').length;
  const inProgressCount = jobs.filter(j => j.status === 'in_progress' || j.status === 'pending').length;
  const completedCount  = jobs.filter(j => j.status === 'completed').length;

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ marginBottom: 6 }}><span className="eyebrow">Maintain · Firmware management</span></div>
          <h1>OTA <em>Updates</em>.</h1>
          <p className="lede">Manage firmware versions and orchestrate over-the-air update rollouts across your devices.</p>
        </div>
        <div style={{ gridColumn: 3, display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 20 }}>
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setShowUpload(true)}>
            <Upload size={13} /> Upload firmware
          </button>
        </div>
      </div>

      {/* ── KPI ticker ── */}
      <div className="ticker">
        {[
          { n: '01', v: firmware.length,  l: 'Total versions',   c: undefined },
          { n: '02', v: activeCount,      l: 'Active firmware',  c: 'hsl(var(--good))' },
          { n: '03', v: inProgressCount,  l: 'Jobs in progress', c: 'hsl(var(--warn))' },
          { n: '04', v: completedCount,   l: 'Jobs completed',   c: 'hsl(var(--primary))' },
        ].map(({ n, v, l, c }) => (
          <div key={n} className="tick">
            <span className="tick-n">{n}</span>
            <span className="tick-v" style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: c }}>{v}</span>
            <span className="tick-l">{l}</span>
          </div>
        ))}
      </div>

      {/* ── Section I: Firmware Library ── */}
      <div className="section" style={{ alignItems: 'start' }}>
        <div>
          <div className="ssh">Firmware<br />Library</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '22ch' }}>
            {firmware.length} version{firmware.length !== 1 ? 's' : ''} shown.
          </p>
          <div className="seg" style={{ marginTop: 16 }}>
            {(['all', 'active', 'ready', 'deprecated', 'archived'] as const).map(f => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="panel table-responsive" style={{ minWidth: 0, overflow: 'auto' }}>
          {fwLoading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : firmware.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8 }}>
                No <em style={{ color: 'hsl(var(--primary))' }}>firmware</em> here
              </div>
              <p className="dim" style={{ fontSize: 13 }}>Try a different filter or upload a new version.</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Firmware</th>
                  <th>Version</th>
                  <th className="hide-sm">Category</th>
                  <th className="hide-sm">Size</th>
                  <th className="hide-sm">Devices</th>
                  <th>Status</th>
                  <th className="hide-sm">Uploaded</th>
                  <th style={{ width: 140 }} />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {firmware.map(fw => (
                    <FirmwareRow
                      key={fw._id} fw={fw}
                      onStatusChange={(id, s) => statusMut.mutate({ id, status: s })}
                      onDelete={setDeleteTarget}
                      onDeploy={setDeployTarget}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Section II: Update Jobs ── */}
      <div className="section">
        <div>
          <div className="ssh">Update<br />Jobs</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '22ch' }}>
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} dispatched.
          </p>
        </div>
        <div>
          {jobsLoading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : jobs.length === 0 ? (
            <div className="panel" style={{ padding: '48px 16px', textAlign: 'center' }}>
              <p className="dim" style={{ fontSize: 13 }}>No rollout jobs yet. Deploy a firmware version to create one.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {jobs.map(job => {
                const cfg = JOB_CFG[job.status] ?? JOB_CFG.pending;
                const pct = Math.round((job.progress / job.total) * 100);
                return (
                  <div key={job._id} className="panel" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>{job.name}</div>
                        <div className="mono faint" style={{ fontSize: 11 }}>
                          v{job.firmwareVersion} · {job.progress}/{job.total} devices
                        </div>
                      </div>
                      <span className={`tag ${cfg.tag}`}>{cfg.label}</span>
                    </div>
                    <div style={{ height: 3, background: 'hsl(var(--border))', overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        style={{ height: '100%', background: cfg.color }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span className="mono faint" style={{ fontSize: 11 }}>{pct}% complete</span>
                      <span className="mono faint" style={{ fontSize: 11 }}>{job.progress} / {job.total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {deployTarget && <DeployModal fw={deployTarget} onClose={() => setDeployTarget(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {deleteTarget && (
          <ConfirmModal
            title="Delete firmware"
            message={`Delete ${deleteTarget.name} v${deleteTarget.version}? This cannot be undone.`}
            confirmLabel="Delete"
            danger
            onConfirm={() => deleteMut.mutate(deleteTarget._id)}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
