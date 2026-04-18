import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { timeAgo, cn } from '@/lib/utils';
import { Activity, MapPin, Bell, Terminal, Upload } from 'lucide-react';

interface FeedItem {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
}

const EVENT_ICONS: Record<string, any> = {
  'telemetry.update': Activity,
  'device.online': Activity,
  'device.offline': Activity,
  'location.update': MapPin,
  'alert.created': Bell,
  'command.executed': Terminal,
  'ota.completed': Upload,
};

export function ActivityFeed() {
  const { on } = useSocket();
  const [items, setItems] = useState<FeedItem[]>([
    { id: '1', type: 'telemetry.update', message: 'Env Sensor B1 sent telemetry — temperature: 24.3°C', timestamp: new Date(Date.now() - 45_000) },
    { id: '2', type: 'device.online', message: 'Tracker Alpha-01 came online', timestamp: new Date(Date.now() - 120_000) },
    { id: '3', type: 'alert.created', message: 'High temperature detected on Env Sensor B2', timestamp: new Date(Date.now() - 300_000) },
    { id: '4', type: 'command.executed', message: 'Command "reboot" executed on Pump Controller E1', timestamp: new Date(Date.now() - 600_000) },
    { id: '5', type: 'location.update', message: 'Tracker Alpha-02 location updated — speed: 45 km/h', timestamp: new Date(Date.now() - 900_000) },
  ]);

  useEffect(() => {
    const events: Array<[string, (e: any) => void]> = [
      ['telemetry.update', (e: any) => {
        setItems(prev => [{
          id: Date.now().toString(),
          type: 'telemetry.update',
          message: `Device received telemetry update`,
          timestamp: new Date(),
        }, ...prev.slice(0, 19)]);
      }],
      ['device.online', (e: any) => {
        setItems(prev => [{
          id: Date.now().toString(),
          type: 'device.online',
          message: `Device came online`,
          timestamp: new Date(),
        }, ...prev.slice(0, 19)]);
      }],
      ['alert.created', (e: any) => {
        setItems(prev => [{
          id: Date.now().toString(),
          type: 'alert.created',
          message: e.data?.title ?? 'New alert triggered',
          timestamp: new Date(),
        }, ...prev.slice(0, 19)]);
      }],
    ];

    const unsubs = events.map(([ev, handler]) => on(ev, handler));
    return () => { unsubs.forEach(u => u()); };
  }, [on]);

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-surface-border">
        <h3 className="text-sm font-semibold text-slate-200">Live Activity</h3>
        <p className="text-xs text-slate-500 mt-0.5">Real-time platform events</p>
      </div>
      <div className="divide-y divide-surface-border/50">
        <AnimatePresence initial={false}>
          {items.slice(0, 8).map(item => {
            const Icon = EVENT_ICONS[item.type] ?? Activity;
            const isAlert = item.type === 'alert.created';
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-3 p-3 hover:bg-surface-3/30 transition-colors"
              >
                <div className={cn('mt-0.5 p-1.5 rounded-lg shrink-0',
                  isAlert ? 'bg-rose-500/10 text-rose-400' :
                  item.type === 'device.online' ? 'bg-emerald-500/10 text-emerald-400' :
                  'bg-orion-600/10 text-orion-400'
                )}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 line-clamp-1">{item.message}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{timeAgo(item.timestamp)}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
