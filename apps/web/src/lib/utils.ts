import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy HH:mm') {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt);
}

export function timeAgo(date: string | Date) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatNumber(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

export function statusColor(status: string) {
  switch (status) {
    case 'online': return 'text-emerald-400';
    case 'offline': return 'text-slate-500';
    case 'error': return 'text-rose-400';
    case 'idle': return 'text-amber-400';
    case 'provisioning': return 'text-orion-400';
    default: return 'text-slate-400';
  }
}

export function severityColor(severity: string) {
  switch (severity) {
    case 'info': return 'text-sky-400';
    case 'warning': return 'text-amber-400';
    case 'error': return 'text-rose-400';
    case 'critical': return 'text-rose-300';
    default: return 'text-slate-400';
  }
}

export function categoryIcon(category: string): string {
  const map: Record<string, string> = {
    tracker: '📍',
    environmental: '🌡️',
    energy: '⚡',
    water: '💧',
    pump: '🔄',
    gateway: '📡',
    mobile: '📱',
    fixed: '🏭',
    research: '🔬',
    industrial: '⚙️',
    telemetry: '📊',
    custom: '🔧',
  };
  return map[category] ?? '📟';
}

export function generateChartColor(index: number): string {
  const colors = [
    '#6272f2', '#8b5cf6', '#06b6d4', '#10b981',
    '#f59e0b', '#f43f5e', '#3b82f6', '#14b8a6',
    '#a855f7', '#ec4899', '#84cc16', '#f97316',
  ];
  return colors[index % colors.length];
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeout: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  }) as T;
}
