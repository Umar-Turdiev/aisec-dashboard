import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { FindingsComponent } from './components/findings/findings.component';
import { CompliancesComponent } from './components/compliances/compliances.component';
import { PipelinesComponent } from './components/pipelines/pipelines.component';
import { RulesComponent } from './components/rules/rules.component';

const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'findings', component: FindingsComponent },
  { path: 'compliances', component: CompliancesComponent },
  { path: 'pipelines', component: PipelinesComponent },
  { path: 'rules', component: RulesComponent },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
