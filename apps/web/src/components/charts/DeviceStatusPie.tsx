import ReactECharts from 'echarts-for-react';
import { generateChartColor, getCategoryIconInfo } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';

interface Props {
  data: Array<{ name: string; value: number }>;
  online: number;
  offline: number;
  total: number;
}

export function DeviceStatusPie({ data, online, offline, total }: Props) {
  const { theme } = useUIStore();
  const isDark = theme === 'dark';

  const tooltipBg     = isDark ? '#1a1a1a' : '#ffffff';
  const tooltipBorder = isDark ? '#333' : '#e5e7eb';
  const tooltipText   = isDark ? '#f5f5f5' : '#111827';
  const centerFg      = isDark ? '#f1f5f9' : '#111827';
  const centerSub     = isDark ? '#64748b' : '#9ca3af';

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: { color: tooltipText, fontSize: 12 },
      formatter: (params: any) => {
        const info = getCategoryIconInfo(params.name);
        return `${info.label}<br/><b>${params.value} devices</b> (${params.percent}%)`;
      },
    },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['50%', '54%'],
        data: data.map((d, i) => ({
          ...d,
          name: d.name || 'unknown',
          itemStyle: {
            color: generateChartColor(i),
            borderWidth: 2,
            borderColor: isDark ? '#151210' : '#ffffff',
          },
        })),
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.25)' },
          scale: true,
          scaleSize: 4,
        },
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: { text: String(total), fill: centerFg, fontSize: 24, fontWeight: '700', fontFamily: 'Inter' },
      },
      {
        type: 'text',
        left: 'center',
        top: '52%',
        style: { text: 'devices', fill: centerSub, fontSize: 11, fontFamily: 'Inter' },
      },
    ],
  };

  return (
    <div className="card p-5">
      <h3 className="text-[13px] font-semibold text-foreground mb-1">By Category</h3>
      <ReactECharts option={option} style={{ height: 186 }} notMerge />
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[12px] text-muted-foreground">{online} online</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-border" />
          <span className="text-[12px] text-muted-foreground">{offline} offline</span>
        </div>
      </div>
    </div>
  );
}
