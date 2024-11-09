import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

@Injectable({
  providedIn: 'root'
})
export class DatasetService {
  /**
   * Initialize a new instance of StandardGraphService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Retrieve specific Dataset information
   * @param containerId the container id
   * @param datasetName the dataset name
   * @returns an Observable of Http request
   */
  public getDataset(containerId: string, datasetName: string): Observable<ApiResponse<any>> {
    const params = new HttpParams().set('container_id', containerId).set('dataset_name', datasetName);

    return this.apiService.get(`${environment.baseUrl}/datasets/single`, params);
  }

  /**
   * Get all dataset
   * @param containerId the container id
   * @returns Observable of Http request
   */
  public getAllDataset(containerId: string): Observable<ApiResponse<any>> {
    const params = new HttpParams().set('container_id', containerId);

    return this.apiService.get(`${environment.baseUrl}/datasets`, params);
  }

  /**
   * Update specific dataset information (description)
   * @params containerId the container id
   * @param datasetName the dataset name
   * @param datasetDescription the dataset new description
   * @returns Observable of Http request
   */
  public updateDatasetDescription(containerId: string, datasetName: string, datasetDescription: string): Observable<ApiResponse<any>> {
    const jsonRequest = {
      container_id: containerId,
      dataset_name: datasetName,
      dataset_description: datasetDescription
    };

    return this.apiService.post(`${environment.baseUrl}/datasets/single`, jsonRequest);
  }

  /**
   * Get specific dataset
   * @params containerId the container id
   * @param datasetName the dataset name
   * @returns Observable of Http request
   */
  public deleteDataset(containerId: string, datasetName: string): Observable<ApiResponse<any>> {
    const params = new HttpParams().set('container_id', containerId).set('dataset_name', datasetName);

    return this.apiService.delete(`${environment.baseUrl}/datasets/single`, params);
  }

  /**
   * Check unique dataset name
   * @param containerId the container id
   * @param datasetName the dataset name
   * @returns Observable of Http request
   */
  public checkUniqueDataset(containerId: string, datasetName: string): Observable<ApiResponse<any>> {
    const jsonRequest = {
      container_id: containerId,
      dataset_name: datasetName
    };

    return this.apiService.post(`${environment.baseUrl}/datasets/exist`, jsonRequest);
  }
}
