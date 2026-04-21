import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  Navigation2, Thermometer, Zap, Droplets, Settings2, Radio, Smartphone,
  Building2, FlaskConical, Cog, Activity, Cpu, Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy HH:mm') {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, fmt);
  } catch {
    return '—';
  }
}

export function timeAgo(date: string | Date) {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
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

export interface CategoryIconInfo {
  Icon: LucideIcon;
  color: string;
  bg: string;
  label: string;
}

const CATEGORY_MAP: Record<string, CategoryIconInfo> = {
  tracker:       { Icon: Navigation2,  color: '#6366f1', bg: 'bg-indigo-500/10',   label: 'Tracker'       },
  environmental: { Icon: Thermometer,  color: '#10b981', bg: 'bg-emerald-500/10',  label: 'Environmental' },
  energy:        { Icon: Zap,          color: '#f59e0b', bg: 'bg-amber-500/10',    label: 'Energy'        },
  water:         { Icon: Waves,        color: '#0ea5e9', bg: 'bg-sky-500/10',      label: 'Water'         },
  pump:          { Icon: Settings2,    color: '#8b5cf6', bg: 'bg-violet-500/10',   label: 'Pump'          },
  gateway:       { Icon: Radio,        color: '#06b6d4', bg: 'bg-cyan-500/10',     label: 'Gateway'       },
  mobile:        { Icon: Smartphone,   color: '#f97316', bg: 'bg-orange-500/10',   label: 'Mobile'        },
  fixed:         { Icon: Building2,    color: '#6b7280', bg: 'bg-gray-500/10',     label: 'Fixed'         },
  research:      { Icon: FlaskConical, color: '#a855f7', bg: 'bg-purple-500/10',   label: 'Research'      },
  industrial:    { Icon: Cog,          color: '#ef4444', bg: 'bg-red-500/10',      label: 'Industrial'    },
  telemetry:     { Icon: Activity,     color: '#0284c7', bg: 'bg-blue-500/10',     label: 'Telemetry'     },
  custom:        { Icon: Cpu,          color: '#ea580c', bg: 'bg-orange-500/10',   label: 'Custom'        },
  droplets:      { Icon: Droplets,     color: '#0ea5e9', bg: 'bg-sky-500/10',      label: 'Fluid'         },
};

export function getCategoryIconInfo(category: string): CategoryIconInfo {
  return CATEGORY_MAP[category] ?? { Icon: Cpu, color: '#ea580c', bg: 'bg-orange-500/10', label: category };
}

/** @deprecated Use getCategoryIconInfo(category).label instead */
export function categoryIcon(category: string): string {
  return getCategoryIconInfo(category).label;
}

export function statusColor(status: string) {
  switch (status) {
    case 'online':       return 'text-green-600 dark:text-green-400';
    case 'offline':      return 'text-muted-foreground';
    case 'error':        return 'text-red-600 dark:text-red-400';
    case 'idle':         return 'text-amber-600 dark:text-amber-400';
    case 'provisioning': return 'text-primary';
    default:             return 'text-muted-foreground';
  }
}

export function severityColor(severity: string) {
  switch (severity) {
    case 'info':     return 'text-blue-600 dark:text-blue-400';
    case 'warning':  return 'text-amber-600 dark:text-amber-400';
    case 'error':    return 'text-red-600 dark:text-red-400';
    case 'critical': return 'text-red-600 dark:text-red-400';
    default:         return 'text-muted-foreground';
  }
}

export function generateChartColor(index: number): string {
  const colors = [
    '#6366f1', '#10b981', '#f59e0b', '#06b6d4',
    '#f97316', '#a855f7', '#ef4444', '#0ea5e9',
    '#8b5cf6', '#ec4899', '#84cc16', '#ea580c',
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

/** Format a payload object according to the device's chosen payloadFormat */
export function formatPayloadStr(data: Record<string, unknown>, format: string): string {
  switch (format) {
    case 'xml': {
      const inner = Object.entries(data)
        .map(([k, v]) => `  <${k}>${v}</${k}>`)
        .join('\n');
      return `<data>\n${inner}\n</data>`;
    }
    case 'csv': {
      const keys = Object.keys(data).join(',');
      const vals = Object.values(data).map(v => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v)).join(',');
      return `${keys}\n${vals}`;
    }
    case 'raw':
      return Object.entries(data).map(([k, v]) => `${k}=${v}`).join('&');
    default:
      return JSON.stringify(data, null, 2);
  }
}

/** Format a single command for dispatch in the device's payloadFormat */
export function formatCommandStr(name: string, value: unknown, format: string): string {
  switch (format) {
    case 'xml':
      return `<command>\n  <name>${name}</name>\n  <value>${value}</value>\n</command>`;
    case 'csv':
      return `${name},${value}`;
    case 'raw':
      return `${name}=${value}`;
    default:
      return JSON.stringify({ [name]: value }, null, 2);
  }
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map(r => keys.map(k => {
      const v = String(r[k] ?? '');
      return v.includes(',') ? `"${v}"` : v;
    }).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Premium multi-sheet Excel export ─────────────────────────────────
export interface XLSXSheet {
  name: string;
  rows: Record<string, unknown>[];
  /** Optional column-width hints (characters). Keys match row object keys. */
  colWidths?: Record<string, number>;
}

export async function downloadXLSX(filename: string, sheets: XLSXSheet[], meta?: { title?: string; generatedBy?: string }) {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: meta?.title ?? filename,
    Author: meta?.generatedBy ?? 'Orion Platform',
    CreatedDate: new Date(),
  };

  for (const sheet of sheets) {
    if (!sheet.rows.length) continue;
    const keys = Object.keys(sheet.rows[0]);

    // Header row + data rows as array-of-arrays so we control ordering
    const aoa: unknown[][] = [
      keys.map(k => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())), // pretty headers
      ...sheet.rows.map(r => keys.map(k => {
        const v = r[k];
        // Keep numbers as numbers, dates as JS Date (SheetJS converts them)
        if (v instanceof Date) return v;
        if (typeof v === 'number') return v;
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v);
        return v ?? '';
      })),
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths — use hint or auto-detect from data
    ws['!cols'] = keys.map(k => {
      const hint = sheet.colWidths?.[k];
      if (hint) return { wch: hint };
      const maxLen = Math.max(
        k.length,
        ...sheet.rows.map(r => String(r[k] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });

    // Freeze header row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
