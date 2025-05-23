import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

/**
 * Graph service
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
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
   * @returns an Observable of ApiResponse object
   */
  public createGraph(
    formData: FormData,
    datasetName: string,
    datasetDescription: string,
    saveProcessExecution: boolean,
    allColumns: string[],
    standardColumn: string[],
    filteredColumn: string[],
    valuesColumn: string[]
  ): Observable<ApiResponse<any>> {
    // Create the form
    formData.append('dataset_name', datasetName);
    formData.append('dataset_description', datasetDescription);
    formData.append('process_execution', saveProcessExecution.toString());
    formData.append('all_columns', JSON.stringify(allColumns));
    formData.append('standardColumn', JSON.stringify(standardColumn));
    formData.append('filteredColumn', JSON.stringify(filteredColumn));
    formData.append('valuesColumn', JSON.stringify(valuesColumn));

    return this.apiService.post(`${environment.baseUrl}/graph`, formData);
  }

  /**
   * Send the svg to the backend
   * @param svg the svg
   * @returns an Observable of ApiResponse object
   */
  public sendSVG(svg: string, datasetName: string): Observable<ApiResponse<any>> {
    // Create the body object
    const bodyRequest = {
      dataset_name: datasetName,
      svg: svg
    };

    return this.apiService.post(`${environment.baseUrl}/graph/svg`, bodyRequest);
  }

  /**
   * Get event nodes
   * @returns an Observable of ApiResponse object
   */
  public getEventNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/nodes/event`);
  }

  /**
   * Get event nodes count
   * @returns an Observable of ApiResponse object
   */
  public getCountEventNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/nodes/event/count`);
  }

  /**
   * Get entity nodes
   * @returns an Observable of ApiResponse object
   */
  public getEntityNodes(distinct: boolean): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/nodes/entity?distinct=${distinct}`);
  }

  /**
   * Get entity nodes count
   * @returns an Observable of ApiResponse object
   */
  public getCountEntityNodes(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/nodes/entity/count`);
  }

  /**
   * Get :CORR rel
   * @returns an Observable of ApiResponse object
   */
  public getCorrRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/relationships/corr`);
  }

  /**
   * Get :CORR rel count
   * @returns an Observable of ApiResponse object
   */
  public getCountCorrRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/relationships/corr/count`);
  }

  /**
   * Get :DF rel
   * @returns an Observable of ApiResponse object
   */
  public getDfRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/relationships/df`);
  }

  /**
   * Get count :DF rel count
   * @returns an Observable of ApiResponse object
   */
  public getCountDfRelationships(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/relationships/df/count`);
  }

  /**
   * Get the entity keys
   * @returns an Observable of ApiResponse object
   */
  public getEntityKey(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/entities_key`);
  }

  /**
   * Get the null entity
   * @returns an Observable of ApiResponse object
   */
  public getNullEntities(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/null-entities`);
  }

  /**
   * Get all the name of the different activities
   * @returns an Observable of ApiResponse object
   */
  public getActivitiesName(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/activities`);
  }

  /**
   * Get the min and max timestamp for nodes
   * @returns  an Observable of ApiResponse object
   */
  public getMinMaxTimestamp(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/graph/timestamps`);
  }

  /**
   * Delete the standard graph by the Database
   * @returns an Observable of ApiResponse object
   */
  public deleteGraph(): Observable<ApiResponse<any>> {
    return this.apiService.delete(`${environment.baseUrl}/graph`);
  }
}
