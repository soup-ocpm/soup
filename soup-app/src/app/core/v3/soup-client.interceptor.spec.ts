import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { CLIENT_HEADER, isBackendUrl, soupClientInterceptor } from './soup-client.interceptor';

describe('soupClientInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const api = `${environment.backendOrigin}/api/v3`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([soupClientInterceptor])), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** The value of the header on the request sent for `send`. */
  function headerOf(url: string, method: string, send: () => void): string | null {
    send();
    const request = backend.expectOne((req) => req.url === url && req.method === method);
    const value = request.request.headers.get(CLIENT_HEADER);
    request.flush({});
    return value;
  }

  it('adds X-Soup-Client: 1 to POST, PUT, PATCH and DELETE to the backend', () => {
    expect(headerOf(`${api}/operations/x/run`, 'POST', () => http.post(`${api}/operations/x/run`, {}).subscribe())).toBe('1');
    expect(headerOf(`${api}/preferences/theme`, 'PUT', () => http.put(`${api}/preferences/theme`, {}).subscribe())).toBe('1');
    expect(headerOf(`${api}/objects/1`, 'PATCH', () => http.patch(`${api}/objects/1`, {}).subscribe())).toBe('1');
    expect(headerOf(`${api}/objects/1`, 'DELETE', () => http.delete(`${api}/objects/1`).subscribe())).toBe('1');
  });

  it('keeps the other headers of the request', () => {
    http.put(`${api}/objects/1/thumbnail`, '<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }).subscribe();
    const request = backend.expectOne(`${api}/objects/1/thumbnail`);
    expect(request.request.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(request.request.headers.get(CLIENT_HEADER)).toBe('1');
    request.flush({});
  });

  it('does not add it to GET', () => {
    expect(headerOf(`${api}/objects`, 'GET', () => http.get(`${api}/objects`).subscribe())).toBeNull();
  });

  it('never sends it to another site', () => {
    expect(headerOf('https://evil.example/api/v3/x', 'POST', () => http.post('https://evil.example/api/v3/x', {}).subscribe())).toBeNull();
  });

  it('recognizes the URLs of the backend', () => {
    expect(isBackendUrl('http://127.0.0.1:8080/api/v3/objects', 'http://127.0.0.1:8080')).toBe(true);
    expect(isBackendUrl('http://localhost:8080/api/v3/objects', 'http://127.0.0.1:8080')).toBe(false);
    // Without a backend origin: the page's own origin (relative URLs).
    expect(isBackendUrl('/api/v3/objects', '')).toBe(true);
    expect(isBackendUrl('https://evil.example/x', '')).toBe(false);
  });
});
