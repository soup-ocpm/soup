import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';
import { Container } from '../models/docker_container.model';

@Injectable({
  providedIn: 'root'
})
export class StandardGraphService {
  /**
   * Initialize a new instance of StandardGraphService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Create the standard graph
   * @param formData the FormData data
   * @param filteredColumn the filtered column
   * @param valuesColumn the values for node
   * @param fixed the fixed value column
   * @param variable the variable value column
   * @param container the docker container
   * @returns Observable of ApiResponse object
   */
  public createGraph(
    formData: FormData,
    datasetName: string,
    datasetDescription: string,
    saveProcessExecution: boolean,
    standardCreation: string,
    allColumns: string[],
    standardColumn: string[],
    filteredColumn: string[],
    valuesColumn: string[],
    fixed: string,
    variable: string,
    container: Container
  ): Observable<ApiResponse<any>> {
    formData.append('dataset_name', datasetName);
    formData.append('dataset_description', datasetDescription);
    formData.append('process_execution', saveProcessExecution.toString());
    formData.append('all_columns', JSON.stringify(allColumns));
    formData.append('standardCreation', standardCreation);
    formData.append('standardColumn', JSON.stringify(standardColumn));
    formData.append('filteredColumn', JSON.stringify(filteredColumn));
    formData.append('valuesColumn', JSON.stringify(valuesColumn));
    formData.append('fixed', JSON.stringify(fixed));
    formData.append('variable', JSON.stringify(variable));
    if (container && container.id) {
      formData.append('container_id', container.id);
    } else {
      formData.append('container_id', '');
    }
    return this.apiService.post(`${environment.baseUrl}/graph`, formData);
  }

  /**
   * Get event nodes
   * @returns Observable of ApiResponse object
   */
  public getEventNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/nodes/event`);
  }

  /**
   * Get event nodes count
   * @returns Observable of ApiResponse object
   */
  public getCountEventNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/nodes/event/count`);
  }

  /**
   * Get entity nodes
   * @returns Observable of ApiResponse object
   */
  public getEntityNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/nodes/entity`);
  }

  /**
   * Get entity nodes count
   * @returns Observable of ApiResponse object
   */
  public getCountEntityNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/nodes/entity/count`);
  }

  /**
   * Get :CORR rel
   * @returns Observable of ApiResponse object
   */
  public getCorrRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/relationships/corr`);
  }

  /**
   * Get :CORR rel count
   * @returns Observable of ApiResponse object
   */
  public getCountCorrRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/relationships/corr/count`);
  }

  /**
   * Get :DF rel
   * @returns Observable of ApiResponse object
   */
  public getDfRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/relationships/df`);
  }

  /**
   * Get count :DF rel count
   * @returns Observable of ApiResponse object
   */
  public getCountDfRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/relationships/df/count`);
  }

  /**
   * Delete the standard graph by the Database
   * @returns Observable of ApiResponse object
   */
  public deleteGraph(): Observable<ApiResponse<any>> {
    return this.apiService.delete(`${environment.baseUrl}/graph`);
  }

  /**
   * Get the entity keys
   * @returns Observable of ApiResponse object
   */
  public getEntityKey(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/entities_key`);
  }

  /**
   * Get the null entity
   * @returns Observable of ApiResponse object
   */
  public getNullEntities(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/null-entities`);
  }
}
