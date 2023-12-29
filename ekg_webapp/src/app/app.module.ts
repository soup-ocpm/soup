// STANDARD IMPORT
import { NgModule } from '@angular/core';
import { AppRoutingModule } from './app-routing.module';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';


// COMPONENT IMPORT (PAGE AND OTHER COMPONENT)
import { AppComponent } from './app.component';
import { HomePageComponent } from './pages/home-page/home-page.component';
import { LoadPageComponent } from './pages/load-page/load-page.component';
import { ConnectorPageComponent } from './pages/connector-page/connector-page.component';
import { GraphPageComponent } from './pages/graph-page/graph-page.component';


// COMPONENT SERVICE
import { GraphService } from './services/graph.service';
import { GraphDataService } from './services/graph.data.service';
import { ConnectorPageService } from './pages/connector-page/connector-page.service';


// MATERIAL IMPORT
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatStepperModule } from '@angular/material/stepper';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';


// OTHER IMPORT
import { NgxDropzoneModule } from 'ngx-dropzone';
import { NgxGraphModule } from '@swimlane/ngx-graph';


@NgModule({
  declarations: [
    AppComponent,
    HomePageComponent,
    LoadPageComponent,
    ConnectorPageComponent,
    GraphPageComponent,
  ],
  imports: [
    //Standard
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    //Material
    MatButtonModule,
    MatCardModule,
    MatToolbarModule,
    MatIconModule,
    MatSnackBarModule,
    MatCheckboxModule,
    MatDividerModule,
    MatStepperModule,
    MatProgressBarModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatSelectModule,
    //Other
    NgxDropzoneModule,
    NgxGraphModule
  ],
  providers: [
    GraphService,
    GraphDataService,
    ConnectorPageService,
    { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { duration: 1500 } }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
