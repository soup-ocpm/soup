import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../../environments/environment';

/**
 * The header the backend requires on the requests that change data
 * (soup-server/soup/api/security.py): without it they get 403. A page of
 * another site cannot add it without a CORS preflight, which the backend
 * refuses for origins that are not the app's.
 */
export const CLIENT_HEADER = 'X-Soup-Client';
const CLIENT_VALUE = '1';
const CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** True when `url` goes to the backend of the app (environment.backendOrigin, or this page's origin). */
export function isBackendUrl(url: string, backendOrigin = environment.backendOrigin): boolean {
  try {
    const target = new URL(url, window.location.href);
    return target.origin === (backendOrigin || window.location.origin);
  } catch {
    return false;
  }
}

/**
 * Adds X-Soup-Client: 1 to the POST, PUT, PATCH and DELETE requests to the
 * backend: every call of V3ApiService, so also the actions of the package
 * visualizers (context.action). Never to another site, never to GET.
 */
export const soupClientInterceptor: HttpInterceptorFn = (request, next) => {
  if (!CHANGING_METHODS.has(request.method.toUpperCase()) || !isBackendUrl(request.url)) {
    return next(request);
  }
  return next(request.clone({ setHeaders: { [CLIENT_HEADER]: CLIENT_VALUE } }));
};
