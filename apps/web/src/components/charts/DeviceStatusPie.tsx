import ReactECharts from 'echarts-for-react';
import { generateChartColor, categoryIcon } from '@/lib/utils';

interface Props {
  data: Array<{ name: string; value: number }>;
  online: number;
  offline: number;
  total: number;
}

export function DeviceStatusPie({ data, online, offline, total }: Props) {
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1a1b31',
      borderColor: '#2a2b45',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params: any) => `${categoryIcon(params.name)} ${params.name}<br/><b>${params.value} devices</b> (${params.percent}%)`,
    },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: ['55%', '80%'],
        center: ['50%', '55%'],
        data: data.map((d, i) => ({
          ...d,
          name: d.name || 'unknown',
          itemStyle: { color: generateChartColor(i) },
        })),
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 8, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.3)' },
        },
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '42%',
        style: { text: String(total), fill: '#f1f5f9', fontSize: 22, fontWeight: 'bold', fontFamily: 'Inter' },
      },
      {
        type: 'text',
        left: 'center',
        top: '56%',
        style: { text: 'devices', fill: '#64748b', fontSize: 11, fontFamily: 'Inter' },
      },
    ],
  };

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-1">By Category</h3>
      <ReactECharts option={option} style={{ height: 180 }} notMerge />
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-slate-400">{online} online</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span className="text-xs text-slate-400">{offline} offline</span>
        </div>
      </div>
    </div>
  );
}
