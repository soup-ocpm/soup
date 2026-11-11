import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, from, map, Observable, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api_response.model';
import { ApiService } from '../services/api_response.service';
import {
  Block,
  ExportedFile,
  ExporterInfo,
  Field,
  FormValues,
  FrontendModule,
  Health,
  ImporterInfo,
  ImportRequest,
  Inspection,
  ObjectRef,
  ObjectUpdate,
  OperationInfo,
  OperationSelection,
  PackageInfo,
  Preference,
  ToolStatus,
  VisualizerInfo,
  WorkspaceNode
} from './v3.models';

/**
 * Every call of /api/v3. Answers are unwrapped from the Result envelope
 * ({http_status_code, message, response_data}); a failed call errors with
 * the ApiResponse built by ApiService (status code, message and the
 * details of the domain error in responseData).
 */
@Injectable({
  providedIn: 'root'
})
export class V3ApiService {
  // Base URL of the /api/v3 routes
  private readonly base = environment.v3BaseUrl;

  /**
   * Initialize a new instance of V3ApiService service
   * @param api the ApiService service (envelope and errors)
   * @param http the HttpClient client (for the binary answers)
   */
  constructor(
    private api: ApiService,
    private http: HttpClient
  ) {}

  /**
   * A URL answered by the backend (module_url of a bundle) made absolute
   * against the backend origin, so the browser imports it from there.
   * @param url the URL, usually "/api/v3/packages/<n>/app/<path>"
   */
  public resolveUrl(url: string): string {
    const origin = environment.backendOrigin || window.location.origin;
    return new URL(url, origin.endsWith('/') ? origin : `${origin}/`).toString();
  }

  // --- packages ------------------------------------------------------------ //
  public packages(): Observable<PackageInfo[]> {
    return this.unwrap(this.api.get<PackageInfo[]>(`${this.base}/packages`));
  }

  public installPackage(archive: File, allowOverride = false): Observable<PackageInfo> {
    const form = new FormData();
    form.append('file', archive, archive.name);
    form.append('allow_override', String(allowOverride));
    return this.unwrap(this.api.post<PackageInfo>(`${this.base}/packages`, form));
  }

  public enablePackage(name: string): Observable<PackageInfo> {
    return this.unwrap(this.api.post<PackageInfo>(`${this.base}/packages/${this.segment(name)}/enable`, {}));
  }

  public disablePackage(name: string, cascade = false): Observable<string[]> {
    const url = `${this.base}/packages/${this.segment(name)}/disable?cascade=${cascade}`;
    return this.unwrap(this.api.post<{ disabled: string[] }>(url, {})).pipe(map((data) => data.disabled));
  }

  public uninstallPackage(name: string): Observable<string> {
    return this.unwrap(this.api.delete<{ name: string }>(`${this.base}/packages/${this.segment(name)}`)).pipe(map((data) => data.name));
  }

  public frontendManifest(): Observable<FrontendModule[]> {
    return this.unwrap(this.api.get<FrontendModule[]>(`${this.base}/frontend/manifest`));
  }

  // --- workspace ----------------------------------------------------------- //
  public objects(): Observable<WorkspaceNode[]> {
    return this.unwrap(this.api.get<WorkspaceNode[]>(`${this.base}/objects`));
  }

  public objectExists(name: string): Observable<boolean> {
    const params = new HttpParams().set('name', name);
    return this.unwrap(this.api.get<{ exists: boolean }>(`${this.base}/objects/exists`, params)).pipe(map((data) => data.exists));
  }

  public object(id: string): Observable<ObjectRef> {
    return this.unwrap(this.api.get<ObjectRef>(`${this.base}/objects/${this.segment(id)}`));
  }

  public updateObject(id: string, update: ObjectUpdate): Observable<ObjectRef> {
    return this.unwrap(this.api.put<ObjectRef>(`${this.base}/objects/${this.segment(id)}`, update));
  }

  /**
   * Delete an object
   * @param cascade also delete the objects derived from it
   * @param force only remove it from the catalog (its package is not active)
   * @returns the ids of the deleted objects
   */
  public deleteObject(id: string, cascade = false, force = false, confirmDatabaseDrop = false): Observable<string[]> {
    const params = new HttpParams().set('cascade', cascade).set('force', force).set('confirm_database_drop', confirmDatabaseDrop);
    return this.unwrap(this.api.delete<{ deleted: string[] }>(`${this.base}/objects/${this.segment(id)}`, params)).pipe(
      map((data) => data.deleted)
    );
  }

  /**
   * The URL of the SVG preview, for an <img src>: never fetched and
   * inserted as markup.
   * @param version changes the URL after the thumbnail changed
   */
  public thumbnailUrl(id: string, version?: string | number): string {
    const url = `${this.base}/objects/${this.segment(id)}/thumbnail`;
    return version === undefined ? url : `${url}?v=${encodeURIComponent(String(version))}`;
  }

  public setThumbnail(id: string, svg: string): Observable<void> {
    return this.http.put(`${this.base}/objects/${this.segment(id)}/thumbnail`, svg, { headers: { 'Content-Type': 'image/svg+xml' } }).pipe(
      map(() => undefined),
      catchError((error) => throwError(() => this.errorOf(error)))
    );
  }

  // --- import -------------------------------------------------------------- //
  public importers(filename: string): Observable<ImporterInfo[]> {
    const params = new HttpParams().set('filename', filename);
    return this.unwrap(this.api.get<ImporterInfo[]>(`${this.base}/importers`, params));
  }

  public inspect(importerId: string, file: File): Observable<Inspection> {
    return this.unwrap(this.api.post<Inspection>(`${this.base}/imports/inspect`, this.importForm(importerId, file)));
  }

  public preview(importerId: string, file: File, options: FormValues): Observable<Block[]> {
    const form = this.importForm(importerId, file);
    form.append('options', JSON.stringify(options));
    return this.unwrap(this.api.post<{ blocks: Block[] }>(`${this.base}/imports/preview`, form)).pipe(map((data) => data.blocks));
  }

  public import(request: ImportRequest): Observable<ObjectRef> {
    const form = this.importForm(request.importerId, request.file);
    form.append('name', request.name);
    form.append('description', request.description ?? '');
    form.append('options', JSON.stringify(request.options ?? {}));
    return this.unwrap(this.api.post<ObjectRef>(`${this.base}/imports`, form));
  }

  // --- operations ---------------------------------------------------------- //
  public operations(objectIds: string[]): Observable<OperationInfo[]> {
    const params = new HttpParams().set('objects', objectIds.join(','));
    return this.unwrap(this.api.get<OperationInfo[]>(`${this.base}/operations`, params));
  }

  public operationFields(operationId: string, objectIds: string[]): Observable<Field[]> {
    const params = new HttpParams().set('objects', objectIds.join(','));
    return this.unwrap(this.api.get<Field[]>(`${this.base}/operations/${this.segment(operationId)}/fields`, params));
  }

  /** @returns the objects created by the operation */
  public runOperation(operationId: string, objects: OperationSelection, params: FormValues): Observable<ObjectRef[]> {
    return this.unwrap(this.api.post<ObjectRef[]>(`${this.base}/operations/${this.segment(operationId)}/run`, { objects, params }));
  }

  // --- visualizers and exporters ------------------------------------------- //
  public visualizers(objectId: string): Observable<VisualizerInfo[]> {
    return this.unwrap(this.api.get<VisualizerInfo[]>(`${this.base}/objects/${this.segment(objectId)}/visualizers`));
  }

  /** The visualizers of a kind, without an object (e.g. "report" for the blocks of an import preview). */
  public visualizersForKind(kind: string): Observable<VisualizerInfo[]> {
    const params = new HttpParams().set('kind', kind);
    return this.unwrap(this.api.get<VisualizerInfo[]>(`${this.base}/visualizers`, params));
  }

  public visualizerData<T = unknown>(objectId: string, visualizerId: string, params: Record<string, unknown> = {}): Observable<T> {
    const query = new HttpParams().set('params', JSON.stringify(params));
    const url = `${this.base}/objects/${this.segment(objectId)}/visualizers/${this.segment(visualizerId)}/data`;
    return this.unwrap(this.api.get<T>(url, query));
  }

  public visualizerAction<T = unknown>(
    objectId: string,
    visualizerId: string,
    name: string,
    params: Record<string, unknown> = {}
  ): Observable<T> {
    const url = `${this.base}/objects/${this.segment(objectId)}/visualizers/${this.segment(visualizerId)}/actions/${this.segment(name)}`;
    return this.unwrap(this.api.post<T>(url, params));
  }

  public exporters(objectId: string): Observable<ExporterInfo[]> {
    return this.unwrap(this.api.get<ExporterInfo[]>(`${this.base}/objects/${this.segment(objectId)}/exporters`));
  }

  /** The exported file, with the name given by the server (Content-Disposition). */
  public export(objectId: string, exporter: ExporterInfo, params: FormValues = {}): Observable<ExportedFile> {
    const url = `${this.base}/objects/${this.segment(objectId)}/export/${this.segment(exporter.id)}`;
    const query = new HttpParams().set('params', JSON.stringify(params));
    return this.http.get(url, { params: query, observe: 'response', responseType: 'blob' }).pipe(
      map((response: HttpResponse<Blob>) => ({
        filename: this.filenameOf(response) ?? `export${exporter.extension}`,
        blob: response.body ?? new Blob([], { type: exporter.mime })
      })),
      catchError((error) => from(this.blobError(error)).pipe(switchMap((apiError) => throwError(() => apiError))))
    );
  }

  // --- system -------------------------------------------------------------- //
  public preference<T = unknown>(key: string): Observable<T | null> {
    return this.unwrap(this.api.get<Preference<T>>(`${this.base}/preferences/${this.segment(key)}`)).pipe(map((data) => data.value));
  }

  public setPreference<T = unknown>(key: string, value: T): Observable<T> {
    return this.unwrap(this.api.put<Preference<T>>(`${this.base}/preferences/${this.segment(key)}`, { value })).pipe(
      map((data) => data.value as T)
    );
  }

  public tools(): Observable<ToolStatus[]> {
    return this.unwrap(this.api.get<ToolStatus[]>(`${this.base}/tools`));
  }

  public health(): Observable<Health> {
    return this.unwrap(this.api.get<Health>(`${this.base}/health`));
  }

  // --- helpers ------------------------------------------------------------- //
  private unwrap<T>(response: Observable<ApiResponse<T>>): Observable<T> {
    return response.pipe(map((answer) => answer.responseData as T));
  }

  private segment(value: string): string {
    return encodeURIComponent(value);
  }

  private importForm(importerId: string, file: File): FormData {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('importer_id', importerId);
    return form;
  }

  private filenameOf(response: HttpResponse<Blob>): string | null {
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (encoded) {
      return decodeURIComponent(encoded[1]);
    }
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    return plain ? plain[1] : null;
  }

  private errorOf(error: any): ApiResponse<any> {
    const body = error?.error;
    const message = body?.message || error?.message || 'An unexpected error occurred';
    return new ApiResponse(error?.status || 500, body?.response_data ?? null, message);
  }

  /** A failed blob request carries the JSON error envelope as a Blob. */
  private async blobError(error: any): Promise<ApiResponse<any>> {
    if (error?.error instanceof Blob) {
      try {
        const body = JSON.parse(await error.error.text());
        return new ApiResponse(error.status || 500, body?.response_data ?? null, body?.message || error.message);
      } catch {
        return this.errorOf({ status: error.status, message: error.message });
      }
    }
    return this.errorOf(error);
  }
}
