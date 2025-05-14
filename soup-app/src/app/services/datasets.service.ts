import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

/**
 * Dataset service
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class DatasetService {
  /**
   * Initialize a new instance of DatasetService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Retrieve specific Dataset information
   * @param containerId the container id
   * @param datasetName the dataset name
   * @returns an Observable of ApiResponse object
   */
  public getDataset(datasetName: string): Observable<ApiResponse<any>> {
    // Add params
    const params = new HttpParams().set('dataset_name', datasetName);

    return this.apiService.get(`${environment.baseUrl}/datasets/single`, params);
  }

  /**
   * Get all dataset
   * @param containerId the container id
   * @returns an Observable of ApiResponse object
   */
  public getAllDataset(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/datasets`);
  }

  /**
   * Update specific dataset information (description)
   * @param datasetName the dataset name
   * @param datasetDescription the dataset new description
   * @returns an Observable of ApiResponse object
   */
  public updateDatasetDescription(datasetName: string, datasetDescription: string): Observable<ApiResponse<any>> {
    // Create body object
    const bodyRequest = {
      dataset_name: datasetName,
      dataset_description: datasetDescription
    };

    return this.apiService.put(`${environment.baseUrl}/datasets/single`, bodyRequest);
  }

  /**
   * Get specific dataset
   * @param datasetName the dataset name
   * @returns an Observable of ApiResponse object
   */
  public deleteDataset(datasetName: string): Observable<ApiResponse<any>> {
    // Add params
    const params = new HttpParams().set('dataset_name', datasetName);

    return this.apiService.delete(`${environment.baseUrl}/datasets/single`, params);
  }

  /**
   * Check unique dataset name
   * @param datasetName the dataset name
   * @returns an Observable of ApiResponse object
   */
  public checkUniqueDataset(datasetName: string): Observable<ApiResponse<any>> {
    // Create body object
    const bodyRequest = {
      dataset_name: datasetName
    };

    return this.apiService.post(`${environment.baseUrl}/datasets/exist`, bodyRequest);
  }
}
