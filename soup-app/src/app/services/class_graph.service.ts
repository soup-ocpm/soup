import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

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
   * @returns Observable of Http request
   */
  public createClassGraph(formData: FormData, filteredColumn: string[], datasetName: string): Observable<ApiResponse<any>> {
    filteredColumn.push('ActivityName');
    formData.append('filteredColumn', JSON.stringify(filteredColumn));
    formData.append('dataset_name', datasetName);

    return this.apiService.post(`${environment.baseUrl}/graph/class`, formData);
  }

  /**
   * Get class nodes
   * @returns
   */
  public getClassNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/nodes`);
  }

  /**
   * Get class nodes count
   * @returns Observable of Http request
   */
  public getCountClassNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/nodes/count`);
  }

  /**
   * Get :OBS relationhips
   * @returns Observable of Http request
   */
  public getObsRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/obs`);
  }

  /**
   * Get :OBS relationships count
   * @returns Observable of Http request
   */
  public getCountObsRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/obs/count`);
  }

  /**
   * Get :DF_C relationships
   * @returns Observable of Http request
   */
  public getDfcRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/dfc`);
  }

  /**
   * Get :DF_C relationships count
   * @returns Observable of Http request
   */
  public getCountDfcRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/class/dfc/count`);
  }

  /**
   * Delete the class graph
   * @returns Observable of Http request
   */
  public deleteGraph(): Observable<ApiResponse<any>> {
    return this.apiService.delete(`${environment.baseUrl}/graph/class`);
  }
}
