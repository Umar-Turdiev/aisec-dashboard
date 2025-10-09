import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { AiChatboxComponent } from './components/ai-chatbox/ai-chatbox.component';
import { FindingsComponent } from './components/findings/findings.component';
import { CompliancesComponent } from './components/compliances/compliances.component';
import { PipelinesComponent } from './components/pipelines/pipelines.component';
import { RulesComponent } from './components/rules/rules.component';
import { StartScreenComponent } from './components/start-screen/start-screen.component';

@NgModule({
  declarations: [
    AppComponent,
    DashboardComponent,
    AiChatboxComponent,
    FindingsComponent,
    CompliancesComponent,
    PipelinesComponent,
    RulesComponent,
    StartScreenComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    HttpClientModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
