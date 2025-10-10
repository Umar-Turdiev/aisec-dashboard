import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import {
  trigger,
  transition,
  query,
  style,
  stagger,
  animate,
} from '@angular/animations';

import { ScanService, StartScanResponse } from '../../services/scan.service';
import type { SarifLog, SarifResult } from '../../models/sarif.model';
import { FindingsService } from '../../services/findings.service';
import {
  ApexChart,
  ApexFill,
  ApexLegend,
  ApexPlotOptions,
  ApexResponsive,
  ApexStroke,
  ApexTheme,
} from 'ng-apexcharts';

type Phase = 'idle' | 'starting' | 'scanning' | 'completed' | 'error';
type Sev = 'critical' | 'high' | 'medium' | 'low' | 'info';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  animations: [
    trigger('widgetsPopIn', [
      transition(':enter', [
        query(
          '.widget',
          [
            style({ transform: 'scale(0.94)', opacity: 0 }),
            stagger(
              120, // time gap between each
              animate(
                '500ms cubic-bezier(0.22, 1, 0.36, 1)',
                style({ transform: 'scale(1)', opacity: 1 })
              )
            ),
          ],
          { optional: true }
        ),
      ]),
    ]),
  ],
})
export class DashboardComponent {
  store = inject(FindingsService);

  // Semgrep-only for this widget (keep or swap to all-tools if you want)
  semgrep = computed(() => this.store.byTool('semgrep')());
  total = computed(() => this.semgrep().length);

  private order: Sev[] = ['critical', 'high', 'medium', 'low', 'info'];

  counts = computed(() => {
    const c: Record<Sev, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const f of this.semgrep()) {
      const s = String(f.severity || 'info').toLowerCase() as Sev;
      if (s in c) c[s]++;
      else c.info++;
    }
    // debug (call signals!)
    // console.log('total', this.total(), 'semgrep', this.semgrep());
    return c;
  });

  // Series/labels for the pie
  severitySeries = computed(() => this.order.map((s) => this.counts()[s]));
  severityLabels = this.order.map((s) => s[0].toUpperCase() + s.slice(1));

  chart: ApexChart = {
    type: 'pie',
    width: '100%',
    height: 300,
    sparkline: { enabled: true },
    background: 'transparent',
  };
  // Golden palette (darkest → lightest)
  colors = ['#a98600', '#dab600', '#e9d700', '#f8ed62', '#fff9ae'];
  dataLabels = {
    enabled: false, // ⬅️ hide text labels on the chart itself
  };
  plotOptions = {
    pie: {
      // offsetY: 10,
      expandOnClick: false,
    },
  };
  stroke: ApexStroke = { width: 3, colors: ['#fff'] };
  legend: ApexLegend = {
    show: true,
    position: 'right', // ⬅️ show legend on right
    fontSize: '14px',
    horizontalAlign: 'center',
    height: 120,
    offsetY: -10,
    labels: {
      colors: ['#2b2b2b'], // text color
    },
    itemMargin: {
      vertical: 4,
    },
  };
  tooltip = {
    theme: 'light',
    style: { fontSize: '14px', color: '#2b2b2b' },
    fillSeriesColor: false,
    marker: { show: false },
  };
  responsive: ApexResponsive[] = [
    {
      breakpoint: 640,
      options: {
        chart: { width: '100%' },
        legend: { position: 'bottom' },
      },
    },
  ];

  // === Single stacked bar (one compact line) ===
  barChart: ApexChart = {
    type: 'bar',
    height: 28,
    width: 200,
    stacked: true,
    sparkline: { enabled: true }, // hides axes/grid
    animations: { enabled: false },
  };

  // your existing order/colors
  barColors = ['#a98600', '#dab600', '#e9d700', '#f8ed62', '#fff9ae'];

  // make ONE category and MULTIPLE series (each series has one value)
  barSeries = computed(() => {
    const c = this.counts();
    return [
      { name: 'Critical', data: [c.critical] },
      { name: 'High', data: [c.high] },
      { name: 'Medium', data: [c.medium] },
      { name: 'Low', data: [c.low] },
      { name: 'Info', data: [c.info] },
    ];
  });

  barPlot: ApexPlotOptions = {
    bar: {
      horizontal: true,
      distributed: false, // must be false for stacking
      barHeight: '100%',
      borderRadius: 10,
    },
  };

  barFill: ApexFill = { opacity: 1, colors: this.barColors };
  barStroke: ApexStroke = { width: 0 };
  barTooltip = {
    enabled: true,
    theme: 'light', // looks consistent with your UI
    x: {
      show: false,
    },
    y: {
      formatter: (val: number, opts: any) => {
        return `${val} issues`; // e.g. "High: 3 issues"
      },
    },
    style: {
      fontSize: '13px',
      color: '#2b2b2b',
    },
  };
  // hide axes completely (we only want the line)
  barXaxis = {
    categories: ['All Severities'],
    labels: { show: false },
    axisTicks: { show: false },
    axisBorder: { show: false },
  };
  barYaxis = { show: false };
  barLegend = { show: false }; // we already have the legend next to the pie

  // === VANTA TOP-5 COMPLIANCE (clean minimal yellow style) ===
  vanta = computed(() => this.store.byTool('vanta')());

  private parseVanta(msg: string) {
    const m = msg.match(/([\d.]+)%\s*complete\s*\((\d+)\s*\/\s*(\d+)/i);
    const percent = m ? Number(m[1]) : 0;
    const done = m ? Number(m[2]) : 0;
    const total = m ? Number(m[3]) : 0;
    return { percent, done, total };
  }

  vantaTop5 = computed(() => {
    const items = this.vanta().map((v) => {
      const { percent, done, total } = this.parseVanta(v.message || '');
      return { title: v.title ?? v.ruleId, percent, done, total };
    });
    return items.sort((a, b) => b.percent - a.percent).slice(0, 5);
  });

  vantaChart: ApexChart = {
    type: 'bar',
    height: 180,
    background: 'transparent',
    sparkline: { enabled: true },
    animations: { enabled: false },
    toolbar: { show: false },
  };

  vantaPlot: ApexPlotOptions = {
    bar: {
      horizontal: true,
      barHeight: '70%',
      borderRadius: 6,
    },
  };

  vantaColors = ['#e9d700']; // bright golden-yellow tone

  vantaSeries = computed(() => [
    {
      name: 'Completion',
      data: this.vantaTop5().map((x) => Number(x.percent.toFixed(1))),
    },
  ]);

  vantaXaxis = computed(() => ({
    categories: this.vantaTop5().map((x) => x.title),
    labels: {
      show: true,
      style: {
        colors: Array(this.vantaTop5().length).fill('#2b2b2b'),
        fontSize: '13px',
        fontWeight: 500,
      },
    },
    axisBorder: { show: false },
    axisTicks: { show: false },
  }));

  vantaYaxis = { show: false };

  vantaDataLabels = {
    enabled: true,
    formatter: (val: number) => `${val.toFixed(1)}%`,
    style: {
      color: '#000',
      fontSize: '13px',
      fontWeight: 600,
    },
    background: {
      enabled: false,
    },
  };

  vantaGrid = {
    show: false, // hide background grid
  };

  vantaTooltip = {
    enabled: true,
    theme: 'light',
    y: {
      formatter: (val: number, opts: any) => {
        const row = this.vantaTop5()[opts.dataPointIndex];
        return `${val.toFixed(1)}% (${row.done}/${row.total} controls)`;
      },
    },
  };
}
