import {NgModule, isDevMode} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {AppRoutingModule} from './app-routing.module';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {HttpClientModule} from '@angular/common/http';
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';

// Component import
import {AppComponent} from './app.component';
import {HomeComponent} from './pages/home/home.component';
import {LoadCsvComponent} from './pages/load-csv/load-csv.component';
import {DetailsComponent} from './pages/details/details.component';
import {GraphComponent} from './pages/graph/graph.component';

// Support Component import
import {CardComponent} from './components/card/card.component';
import {DeleteDialogComponent} from './components/delete-dialog/delete-dialog.component';
import {HelpStandardDialogComponent} from './components/help-standard-dialog/help-standard-dialog.component';
import {HelpClassDialogComponent} from './components/help-class-dialog/help-class-dialog.component';

// Shared Component import
import {NavbarComponent} from './shared/navbar/navbar.component';
import {FooterComponent} from './shared/footer/footer.component';

// Material import
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatIconModule} from '@angular/material/icon';
import {MAT_SNACK_BAR_DEFAULT_OPTIONS, MatSnackBarModule} from '@angular/material/snack-bar';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDividerModule} from '@angular/material/divider';
import {MatStepperModule} from '@angular/material/stepper';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatDialogModule} from '@angular/material/dialog';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatSelectModule} from '@angular/material/select';
import {MatTableModule} from '@angular/material/table';
import {MatRadioModule} from '@angular/material/radio';
import {MatTooltipModule} from '@angular/material/tooltip';

// Services import
import {StandardGraphService} from "./services/standard_graph.service";
import {ClassGraphService} from "./services/class_graph.service";
import {SupportDataService} from "./services/support_data.service";

// Other import
import {NgOptimizedImage} from "@angular/common";
import {NgxDropzoneModule} from 'ngx-dropzone';
import {RetrieveCardComponent} from './components/retrieve-card/retrieve-card.component';
import { ServiceWorkerModule } from '@angular/service-worker';

@NgModule({
  declarations: [
    // Pages component
    AppComponent,
    HomeComponent,
    LoadCsvComponent,
    DetailsComponent,
    GraphComponent,
    // Support component
    CardComponent,
    DeleteDialogComponent,
    HelpStandardDialogComponent,
    HelpClassDialogComponent,
    // Shared component
    NavbarComponent,
    FooterComponent,
    RetrieveCardComponent
  ],
  imports: [
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
    MatTableModule,
    MatRadioModule,
    MatTooltipModule,
    // Other
    NgOptimizedImage,
    NgxDropzoneModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  providers: [
    // Service providers
    StandardGraphService,
    ClassGraphService,
    SupportDataService,
    // Other providers
    provideAnimationsAsync(),
    {provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: {duration: 1500}}
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
}
