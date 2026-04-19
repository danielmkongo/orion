import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Upload, Package, CheckCircle2, Clock, AlertCircle, Trash2, Archive,
  RotateCcw, Star, AlertTriangle, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

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
function UploadModal({ onClose, onUpload }: { onClose: () => void; onUpload: (fw: Firmware) => void }) {
  const [name, setName]         = useState('');
  const [version, setVersion]   = useState('');
  const [category, setCat]      = useState('tracker');
  const [file, setFile]         = useState<File | null>(null);
  const [notes, setNotes]       = useState('');

  const submit = () => {
    if (!name || !version || !file) { toast.error('Fill all required fields'); return; }
    const fw: Firmware = {
      id: Date.now().toString(), name, version, category,
      size: file.size > 1_000_000 ? `${(file.size / 1_048_576).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`,
      status: 'ready', uploadedAt: new Date().toISOString().split('T')[0], devices: 0, changelog: notes,
    };
    onUpload(fw);
    toast.success('Firmware uploaded');
    onClose();
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
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Firmware file *</label>
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
          <button className="btn btn-primary" onClick={submit} style={{ gap: 6 }}><Upload size={13} /> Upload</button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Deploy Modal ──────────────────────────────────────────────────── */
function DeployModal({ fw, onClose, onDeploy }: { fw: Firmware; onClose: () => void; onDeploy: (jobName: string) => void }) {
  const [jobName, setJobName] = useState(`${fw.name} v${fw.version} Rollout`);
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
          <button className="btn btn-primary" onClick={() => { onDeploy(jobName); onClose(); }}>Start rollout</button>
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
  onDelete: (id: string) => void;
  onDeploy: (fw: Firmware) => void;
}) {
  const cfg = STATUS_CFG[fw.status];
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
      <td className="mono faint" style={{ fontSize: 11.5 }}>{fw.uploadedAt}</td>
      <td>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          {fw.status !== 'archived' && fw.status !== 'deprecated' && (
            <button onClick={() => onDeploy(fw)} className="btn btn-ghost btn-sm" style={{ fontSize: 11, gap: 4 }}>
              <Upload size={11} /> Deploy
            </button>
          )}
          {fw.status === 'active' && (
            <button onClick={() => { onStatusChange(fw.id, 'deprecated'); toast.success('Marked deprecated'); }}
              className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
              <AlertTriangle size={11} />
            </button>
          )}
          {fw.status === 'deprecated' && (
            <button onClick={() => { onStatusChange(fw.id, 'active'); toast.success('Marked active'); }}
              className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
              <Star size={11} />
            </button>
          )}
          {fw.status !== 'archived' && (
            <button onClick={() => { onStatusChange(fw.id, 'archived'); toast.success('Archived'); }}
              className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
              <Archive size={11} />
            </button>
          )}
          {fw.status === 'archived' && (
            <button onClick={() => { onStatusChange(fw.id, 'ready'); toast.success('Restored'); }}
              className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
              <RotateCcw size={11} />
            </button>
          )}
          <button
            onClick={() => { if (!confirm(`Delete ${fw.name} v${fw.version}?`)) return; onDelete(fw.id); toast.success('Deleted'); }}
            className="btn btn-ghost btn-sm btn-icon" style={{ color: 'hsl(var(--bad))' }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────── */
export function OtaPage() {
  const [firmware, setFirmware]     = useState<Firmware[]>(INITIAL_FIRMWARE);
  const [jobs, setJobs]             = useState<Job[]>(INITIAL_JOBS);
  const [showUpload, setShowUpload] = useState(false);
  const [deployTarget, setDeployTarget] = useState<Firmware | null>(null);
  const [filter, setFilter]         = useState<FirmwareStatus | 'all'>('all');

  const handleStatusChange = (id: string, status: FirmwareStatus) =>
    setFirmware(f => f.map(fw => fw.id === id ? { ...fw, status } : fw));

  const handleDelete  = (id: string)      => setFirmware(f => f.filter(fw => fw.id !== id));
  const handleUpload  = (fw: Firmware)    => setFirmware(f => [fw, ...f]);
  const handleDeploy  = (jobName: string) => {
    if (!deployTarget) return;
    const newJob: Job = {
      id: Date.now().toString(), name: jobName,
      firmware: `v${deployTarget.version}`, firmwareId: deployTarget.id,
      status: 'pending', progress: 0, total: deployTarget.devices || 1,
      started: new Date().toISOString(),
    };
    setJobs(j => [newJob, ...j]);
    toast.success('Rollout job created');
  };
  const handleRollback = (job: Job) => toast.success(`Rollback initiated for ${job.name}`);

  const filtered        = firmware.filter(fw => filter === 'all' || fw.status === filter);
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
          <p className="lede">Manage firmware versions and orchestrate over-the-air update rollouts across your fleet.</p>
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
          { n: '01', v: firmware.length,  l: 'Total versions',  c: undefined },
          { n: '02', v: activeCount,      l: 'Active firmware', c: 'hsl(var(--good))' },
          { n: '03', v: inProgressCount,  l: 'Jobs in progress',c: 'hsl(var(--warn))' },
          { n: '04', v: completedCount,   l: 'Jobs completed',  c: 'hsl(var(--primary))' },
        ].map(({ n, v, l, c }) => (
          <div key={n} className="tick">
            <span className="tick-n">{n}</span>
            <span className="tick-v" style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: c }}>{v}</span>
            <span className="tick-l">{l}</span>
          </div>
        ))}
      </div>

      {/* ── Section I: Firmware Library ── */}
      <div className="section">
        <div>
          <div className="ssh"><span className="no">№ I</span>Firmware<br />Library</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '22ch' }}>
            {filtered.length} version{filtered.length !== 1 ? 's' : ''} shown.
          </p>
          <div className="seg" style={{ marginTop: 16 }}>
            {(['all', 'active', 'ready', 'deprecated', 'archived'] as const).map(f => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="panel table-responsive">
          {filtered.length === 0 ? (
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
                  {filtered.map(fw => (
                    <FirmwareRow
                      key={fw.id} fw={fw}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
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
          <div className="ssh"><span className="no">№ II</span>Update<br />Jobs</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '22ch' }}>
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} dispatched.
          </p>
        </div>
        <div>
          {jobs.length === 0 ? (
            <div className="panel" style={{ padding: '48px 16px', textAlign: 'center' }}>
              <p className="dim" style={{ fontSize: 13 }}>No rollout jobs yet. Deploy a firmware version to create one.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {jobs.map(job => {
                const cfg = JOB_CFG[job.status] ?? JOB_CFG.pending;
                const pct = Math.round((job.progress / job.total) * 100);
                return (
                  <div key={job.id} className="panel" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>{job.name}</div>
                        <div className="mono faint" style={{ fontSize: 11 }}>
                          {job.firmware} · {job.progress}/{job.total} devices
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`tag ${cfg.tag}`}>{cfg.label}</span>
                        {(job.status === 'failed' || job.status === 'completed') && (
                          <button onClick={() => handleRollback(job)} className="btn btn-ghost btn-sm" style={{ gap: 4, fontSize: 11 }}>
                            <RotateCcw size={11} /> Rollback
                          </button>
                        )}
                      </div>
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
