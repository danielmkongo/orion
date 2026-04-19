import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { timeAgo } from '@/lib/utils';
import { Activity, MapPin, Bell, Terminal, Upload, Wifi, WifiOff } from 'lucide-react';

interface FeedItem {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
}

const EVENT_CONFIG: Record<string, {
  Icon: React.FC<any>; bg: string; text: string;
}> = {
  'telemetry.update': { Icon: Activity,  bg: 'bg-primary/8',              text: 'text-primary' },
  'device.online':    { Icon: Wifi,      bg: 'bg-green-500/10',           text: 'text-green-600 dark:text-green-400' },
  'device.offline':   { Icon: WifiOff,   bg: 'bg-muted',                  text: 'text-muted-foreground' },
  'location.update':  { Icon: MapPin,    bg: 'bg-indigo-500/10',          text: 'text-indigo-600 dark:text-indigo-400' },
  'alert.created':    { Icon: Bell,      bg: 'bg-red-500/10',             text: 'text-red-600 dark:text-red-400' },
  'command.executed': { Icon: Terminal,  bg: 'bg-amber-500/10',           text: 'text-amber-600 dark:text-amber-400' },
  'ota.completed':    { Icon: Upload,    bg: 'bg-cyan-500/10',            text: 'text-cyan-600 dark:text-cyan-400' },
};

const FALLBACK = { Icon: Activity, bg: 'bg-muted', text: 'text-muted-foreground' };

export function ActivityFeed() {
  const { on } = useSocket();
  const [items, setItems] = useState<FeedItem[]>([
    { id: '1', type: 'telemetry.update', message: 'Device sent telemetry update', timestamp: new Date(Date.now() - 45_000) },
    { id: '2', type: 'device.online',    message: 'Device came online',             timestamp: new Date(Date.now() - 120_000) },
    { id: '3', type: 'alert.created',    message: 'Threshold exceeded — alert triggered', timestamp: new Date(Date.now() - 300_000) },
    { id: '4', type: 'command.executed', message: 'Command executed successfully',   timestamp: new Date(Date.now() - 600_000) },
    { id: '5', type: 'location.update',  message: 'Location updated — speed: 45 km/h', timestamp: new Date(Date.now() - 900_000) },
  ]);

  useEffect(() => {
    const subs: Array<[string, string]> = [
      ['telemetry.update', 'Data received'],
      ['device.online',    'Device came online'],
      ['device.offline',   'Device went offline'],
      ['alert.created',    'Alert triggered'],
      ['command.executed', 'Command executed'],
      ['location.update',  'Location updated'],
    ];

    const unsubs = subs.map(([event, defaultMsg]) =>
      on(event, (e: any) => {
        setItems(prev => [{
          id: Date.now().toString(),
          type: event,
          message: e?.data?.title ?? e?.message ?? defaultMsg,
          timestamp: new Date(),
        }, ...prev.slice(0, 19)]);
      })
    );
    return () => { unsubs.forEach(u => u()); };
  }, [on]);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">Live Activity</h3>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </div>
      </div>
      <div className="divide-y divide-border/40">
        <AnimatePresence initial={false}>
          {items.slice(0, 8).map(item => {
            const cfg = EVENT_CONFIG[item.type] ?? FALLBACK;
            const { Icon, bg, text } = cfg;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                transition={{ duration: 0.18 }}
                className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${bg}`}>
                  <Icon size={12} className={text} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-foreground line-clamp-1">{item.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(item.timestamp)}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
