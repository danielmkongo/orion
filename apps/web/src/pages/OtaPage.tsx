import { motion } from 'framer-motion';
import { Upload, Package, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const FIRMWARE = [
  { id: '1', name: 'Tracker Firmware v2.4.1', version: '2.4.1', category: 'tracker',      size: '248 KB', status: 'ready', uploadedAt: '2024-03-10', devices: 12 },
  { id: '2', name: 'Env Sensor v1.8.0',       version: '1.8.0', category: 'environmental',size: '124 KB', status: 'ready', uploadedAt: '2024-03-05', devices: 4  },
  { id: '3', name: 'Gateway OS v3.1.2',        version: '3.1.2', category: 'gateway',      size: '1.2 MB', status: 'ready', uploadedAt: '2024-02-28', devices: 2  },
];

const JOBS = [
  { id: '1', name: 'Fleet Tracker Update', firmware: 'v2.4.1', status: 'in_progress', progress: 7,  total: 12, started: '2024-03-11T09:00:00Z' },
  { id: '2', name: 'Env Sensor Rollout',   firmware: 'v1.8.0', status: 'completed',   progress: 4,  total: 4,  started: '2024-03-06T14:30:00Z' },
  { id: '3', name: 'Gateway Update',       firmware: 'v3.1.2', status: 'failed',      progress: 1,  total: 2,  started: '2024-03-01T11:00:00Z' },
];

const JOB_CONFIG: Record<string, { badge: string; icon: any }> = {
  in_progress: { badge: 'badge-warning',  icon: Clock          },
  completed:   { badge: 'badge-online',   icon: CheckCircle2   },
  failed:      { badge: 'badge-error',    icon: AlertCircle    },
  pending:     { badge: 'badge-info',     icon: Clock          },
};

export function OtaPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">OTA Updates</h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">Manage firmware versions and update rollouts</p>
        </div>
        <button className="btn btn-primary"><Upload size={14} /> Upload Firmware</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Package,     label: 'Firmware Versions', value: FIRMWARE.length,                               accent: 'bg-primary/10 text-primary'          },
          { icon: Clock,       label: 'Active Jobs',        value: JOBS.filter(j => j.status === 'in_progress').length, accent: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
          { icon: CheckCircle2,label: 'Completed Jobs',     value: JOBS.filter(j => j.status === 'completed').length,   accent: 'bg-green-500/10 text-green-600 dark:text-green-400'  },
        ].map(({ icon: Icon, label, value, accent }) => (
          <div key={label} className="card p-5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${accent}`}><Icon size={17} /></div>
            <p className="text-[1.5rem] font-semibold text-foreground tracking-tight">{value}</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Firmware library */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold text-foreground">Firmware Library</span>
          </div>
          <div>
            {FIRMWARE.map((fw, i) => (
              <motion.div key={fw.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="flex items-start justify-between p-4 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Package size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-foreground">{fw.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{fw.size} · {fw.uploadedAt} · {fw.devices} devices</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-online">{fw.status}</span>
                  <button className="btn btn-secondary btn-sm">Deploy</button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Update jobs */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold text-foreground">Update Jobs</span>
          </div>
          <div>
            {JOBS.map((job, i) => {
              const cfg = JOB_CONFIG[job.status] ?? JOB_CONFIG.pending;
              const Icon = cfg.icon;
              const pct = Math.round((job.progress / job.total) * 100);
              return (
                <motion.div key={job.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                  className="p-4 border-b border-border/50 last:border-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[13px] font-medium text-foreground">{job.name}</p>
                      <p className="text-[11px] text-muted-foreground">{job.firmware} · {job.progress}/{job.total} devices</p>
                    </div>
                    <span className={`badge ${cfg.badge} gap-1`}><Icon size={10} /> {job.status.replace('_', ' ')}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${job.status === 'failed' ? 'bg-red-500' : job.status === 'completed' ? 'bg-green-500' : 'bg-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{pct}% complete</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
