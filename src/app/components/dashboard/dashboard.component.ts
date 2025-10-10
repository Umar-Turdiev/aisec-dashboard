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
  private store = inject(FindingsService);

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

  // Monochrome pie settings
  chart: ApexChart = {
    type: 'pie',
    width: '100%',
    sparkline: { enabled: true },
  };
  theme: ApexTheme = {
    monochrome: {
      enabled: true,
      color: '#bcbe1e',
      shadeTo: 'light',
      shadeIntensity: 1,
    },
  };
  tooltip = {
    theme: 'light', // makes tooltip background white and text dark
    style: {
      fontSize: '14px',
      color: '#2b2b2b',
    },
  };
  dataLabels = {
    enabled: true,
    style: {
      colors: ['#2b2b2b'], // white text inside slices (looks great on colored chart)
      fontSize: '14px',
    },
    dropShadow: {
      enabled: false,
    },
    formatter: (_val: number, opts: any) => {
      const label = opts.w.globals.labels[opts.seriesIndex];
      const count = opts.w.globals.series[opts.seriesIndex]; // <-- actual count
      return `${label}:\n ${count}`;
    },
  };
  plotOptions = {
    pie: {
      dataLabels: {
        offset: -9, // ⬅️ negative value pulls labels inward
        minAngleToShowLabel: 10,
      },
    },
  };
  stroke: ApexStroke = { width: 3 };
  responsive: ApexResponsive[] = [
    {
      breakpoint: 480,
      options: { chart: { width: 220 }, legend: { position: 'bottom' } },
    },
  ];
}
