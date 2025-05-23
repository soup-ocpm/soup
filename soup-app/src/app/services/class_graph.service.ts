import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

/**
 * Aggregate graph service
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class ClassGraphService {
  /**
   * Initialize a new instance of ClassGraphService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Create class graph
   * @param formData the FormData data
   * @param filteredColumn the filtered column
   * @returns an Observable of ApiResponse object
   */
  public createClassGraph(formData: FormData, filteredColumn: string[], datasetName: string): Observable<ApiResponse<any>> {
    // Create the form data
    filteredColumn.push('ActivityName');
    formData.append('filteredColumn', JSON.stringify(filteredColumn));
    formData.append('dataset_name', datasetName);

    return this.apiService.post(`${environment.baseUrl}/graph/class`, formData);
  }

  /**
   * Get class nodes
   * @returns an Observable of ApiResponse object
   */
  public getClassNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/nodes`);
  }

  /**
   * Get class nodes count
   * @returns an Observable of ApiResponse object
   */
  public getCountClassNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/nodes/count`);
  }

  /**
   * Get :OBS relationhips
   * @returns an Observable of ApiResponse object
   */
  public getObsRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/obs`);
  }

  /**
   * Get :OBS relationships count
   * @returns an Observable of ApiResponse object
   */
  public getCountObsRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/obs/count`);
  }

  /**
   * Get :DF_C relationships
   * @returns an Observable of ApiResponse object
   */
  public getDfcRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/dfc`);
  }

  /**
   * Get :DF_C relationships count
   * @returns an Observable of ApiResponse object
   */
  public getCountDfcRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/dfc/count`);
  }

  /**
   * Delete the class graph
   * @returns an Observable of ApiResponse object
   */
  public deleteGraph(): Observable<ApiResponse<any>> {
    return this.apiService.delete(`${environment.baseUrl}/graph/class`);
  }
}
