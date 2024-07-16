import {NgModule, isDevMode} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {AppRoutingModule} from './app-routing.module';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {HttpClientModule} from '@angular/common/http';
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
import {SocketIoConfig, SocketIoModule} from "ngx-socket-io";

// Component import
import {AppComponent} from './app.component';

// Application modules import
import {CoreModule} from "./core/core.module";
import {SharedModule} from "./shared/shared.module";
import {ComponentsModule} from "./components/components.module";
import {PagesModule} from "./pages/pages.module";

// Other import
import {ServiceWorkerModule} from '@angular/service-worker';

const config: SocketIoConfig = {url: 'http://localhost:5000', options: {}}

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    // Application module import
    CoreModule,
    SharedModule,
    ComponentsModule,
    PagesModule,
    // Socket IO
    SocketIoModule.forRoot(config),
    // Service worker
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  providers: [
    provideAnimationsAsync(),
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
}
