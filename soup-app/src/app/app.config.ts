import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { PackageLoaderService } from './core/v3/package-loader.service';
import { soupClientInterceptor } from './core/v3/soup-client.interceptor';
import { PAGE_TRANSITIONS } from './page-transitions';

// Application provider configuration
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // The pages slide at every change (page-transitions.ts, styles.scss)
    provideRouter(routes, withViewTransitions(PAGE_TRANSITIONS)),
    // X-Soup-Client on the requests that change data (soup-client.interceptor.ts)
    provideHttpClient(withInterceptors([soupClientInterceptor])),
    // Load the frontend bundles of the active packages, without delaying the start
    provideAppInitializer(() => {
      void inject(PackageLoaderService).reload();
    })
  ]
};
