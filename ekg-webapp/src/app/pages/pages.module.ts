import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Pages component import
import { HomeComponent } from './home/home.component';
import { LoadCsvComponent } from './load-csv/load-csv.component';
import { DetailsComponent } from './details/details.component';
import { GraphComponent } from './graph/graph.component';

// Application modules import
import { MaterialModule } from '../material.module';
import { ComponentsModule } from '../components/components.module';

// Other modules import
import { NgxDropzoneModule } from 'ngx-dropzone';
import { DetailsGraphComponent } from './details-graph/details-graph.component';

@NgModule({
  declarations: [
    HomeComponent,
    LoadCsvComponent,
    DetailsComponent,
    GraphComponent,
    DetailsGraphComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    ComponentsModule,
    NgxDropzoneModule,
  ],
  exports: [
    HomeComponent,
    LoadCsvComponent,
    DetailsComponent,
    GraphComponent,
    DetailsGraphComponent
  ]
})
export class PagesModule {
}
