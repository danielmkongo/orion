import { motion } from 'framer-motion';
import { Upload, Package, CheckCircle, AlertCircle, Clock, Cpu } from 'lucide-react';

// OTA page with complete UI (backend OTA routes would be wired in production)
const DEMO_FIRMWARE = [
  { id: '1', name: 'Tracker Firmware v2.4.1', version: '2.4.1', category: 'tracker', size: '248 KB', status: 'ready', uploadedAt: '2024-03-10', devices: 12 },
  { id: '2', name: 'Env Sensor v1.8.0', version: '1.8.0', category: 'environmental', size: '124 KB', status: 'ready', uploadedAt: '2024-03-05', devices: 4 },
  { id: '3', name: 'Gateway OS v3.1.2', version: '3.1.2', category: 'gateway', size: '1.2 MB', status: 'ready', uploadedAt: '2024-02-28', devices: 2 },
];

const DEMO_JOBS = [
  { id: '1', name: 'Fleet Tracker Update', firmware: 'v2.4.1', status: 'in_progress', progress: 7, total: 12, started: '2024-03-11T09:00:00Z' },
  { id: '2', name: 'Env Sensor Rollout', firmware: 'v1.8.0', status: 'completed', progress: 4, total: 4, started: '2024-03-06T14:30:00Z' },
  { id: '3', name: 'Gateway Update', firmware: 'v3.1.2', status: 'failed', progress: 1, total: 2, started: '2024-03-01T11:00:00Z' },
];

export function OtaPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">OTA Updates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage firmware versions and update rollouts</p>
        </div>
        <button className="btn-primary">
          <Upload className="w-4 h-4" /> Upload Firmware
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Package, label: 'Firmware Versions', value: DEMO_FIRMWARE.length, color: 'bg-orion-600/20 text-orion-400' },
          { icon: Clock, label: 'Active Jobs', value: DEMO_JOBS.filter(j => j.status === 'in_progress').length, color: 'bg-amber-500/20 text-amber-400' },
          { icon: CheckCircle, label: 'Completed Jobs', value: DEMO_JOBS.filter(j => j.status === 'completed').length, color: 'bg-emerald-500/20 text-emerald-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card p-5">
            <div className={`p-2.5 rounded-xl w-fit mb-3 ${color}`}><Icon className="w-4 h-4" /></div>
            <p className="text-2xl font-bold text-slate-100">{value}</p>
            <p className="text-sm text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firmware library */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-surface-border">
            <h3 className="text-sm font-semibold text-slate-200">Firmware Library</h3>
          </div>
          <div className="divide-y divide-surface-border/50">
            {DEMO_FIRMWARE.map((fw, i) => (
              <motion.div key={fw.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="p-4 hover:bg-surface-3/30">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-orion-600/15 rounded-xl flex items-center justify-center">
                      <Package className="w-4 h-4 text-orion-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{fw.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{fw.size} · {fw.uploadedAt} · {fw.devices} devices</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge badge-online text-[10px]">{fw.status}</span>
                    <button className="btn-ghost text-xs px-2 py-1">Deploy</button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Active jobs */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-surface-border">
            <h3 className="text-sm font-semibold text-slate-200">Update Jobs</h3>
          </div>
          <div className="divide-y divide-surface-border/50">
            {DEMO_JOBS.map((job, i) => (
              <motion.div key={job.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{job.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Firmware {job.firmware}</p>
                  </div>
                  <span className={`badge text-[10px] ${
                    job.status === 'completed' ? 'badge-online' :
                    job.status === 'in_progress' ? 'badge-warning' : 'badge-error'
                  }`}>
                    {job.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(job.progress / job.total) * 100}%` }}
                      transition={{ duration: 0.8 }}
                      className={`h-full rounded-full ${
                        job.status === 'completed' ? 'bg-emerald-500' :
                        job.status === 'failed' ? 'bg-rose-500' : 'bg-orion-500'
                      }`}
                    />
                  </div>
                  <span className="text-xs text-slate-500">{job.progress}/{job.total}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
