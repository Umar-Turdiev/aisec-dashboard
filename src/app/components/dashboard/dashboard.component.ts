import { Component, DestroyRef, inject, signal } from '@angular/core';
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

type Phase = 'idle' | 'starting' | 'scanning' | 'completed' | 'error';

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
export class DashboardComponent {}
