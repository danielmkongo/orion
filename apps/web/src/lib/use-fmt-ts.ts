import { useCallback } from 'react';
import { useUIStore } from '@/store/ui.store';
import { formatDeviceTs, formatTs, type DeviceTzInfo, type FormatTsOpts } from '@/lib/utils';

/**
 * Returns formatters bound to the user's Settings timezone preference.
 *
 * - `fmt(ts, device, pattern?)`: device telemetry. Reinterprets stored "fake-UTC"
 *   digits as wall-clock in the device's TZ, then formats in Settings TZ.
 * - `fmtAudit(ts, pattern?)`: server-generated audit timestamps (lastSeenAt,
 *   createdAt, updatedAt) that are already real UTC. Formats in Settings TZ.
 */
export function useFmtTs() {
  const settingsTz = useUIStore(s => s.timezone);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayTz = settingsTz || browserTz;

  const fmt = useCallback(
    (
      ts: Date | string | number | null | undefined,
      device?: DeviceTzInfo | null,
      pattern?: FormatTsOpts['pattern'],
    ) => {
      if (ts == null) return '—';
      return formatDeviceTs(ts, device ?? undefined, displayTz, pattern);
    },
    [displayTz],
  );

  const fmtAudit = useCallback(
    (
      ts: Date | string | number | null | undefined,
      pattern?: FormatTsOpts['pattern'],
    ) => {
      if (ts == null) return '—';
      return formatTs(ts, { displayTz, pattern });
    },
    [displayTz],
  );

  return { fmt, fmtAudit, displayTz, settingsTz };
}
