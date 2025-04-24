import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

/**
 * JSON data service
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class JSONDataService {
  /**
   * Initialize a new instance of StandardGraphService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Get the event node JSON
   * @returns Observable of ApiResponse object
   */
  public eventNodeJSON(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/json/graph/event-nodes`);
  }

  /**
   * Get the entity node JSON
   * @returns Observable of ApiResponse object
   */
  public entityNodeJSON(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/json/graph/entity-nodes`);
  }

  /**
   * Get the corr links JSON
   * @returns Observable of ApiResponse object
   */
  public corrLinkJSON(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/json/graph/corr-links`);
  }

  /**
   * Get the df links JSON
   * @returns Observable of ApiResponse object
   */
  public dfLinkJSON(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/json/graph/df-links`);
  }

  /**
   * Get the class node JSON
   * @returns Observable of ApiResponse object
   */
  public classNodeJSON(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/json/class-graph/class-nodes`);
  }

  /**
   * Get the obs link JSON
   * @returns Observable of ApiResponse object
   */
  public obsLinkJSON(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/json/class-graph/class-obs-links`);
  }

  /**
   * Get the dfc link JSON
   * @returns Observable of ApiResponse object
   */
  public dfcLinkJSON(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/json/class-graph/class-df-links`);
  }
}
