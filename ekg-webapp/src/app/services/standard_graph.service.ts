import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

// Models import
import { Container } from '../core/models/container.model';

@Injectable({
  providedIn: 'root',
})
export class StandardGraphService {

  // Save the api response for the Guard and navigation
  public apiResponse: any;

  // Save the dataset name
  public datasetName: string = '';

  /**
   * Initialize a new instance of StandardGraphService service
   * @param httpClient the Http client
   */
  constructor(
    private httpClient: HttpClient
  ) {
  }

  /**
   * Create the standard graph
   * @param formData the FormData data
   * @param filteredColumn the filtered column
   * @param valuesColumn the values for node
   * @param fixed the fixed value column
   * @param variable the variable value column
   * @param container the docker container
   * @returns Observable of Http request
   */
  public createGraph(formData: FormData, datasetName: string, standardCreation: string, standardColumn: string[], filteredColumn: string[], valuesColumn: string[], fixed: string, variable: string, container: Container): Observable<any> {
    formData.append('name', datasetName);
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
    return this.httpClient.post('http://127.0.0.1:8080/api/v2/graph', formData);
  }

  /**
   * Check unique dataset name
   * @param datasetName the dataset name
   * @returns Observable of Http request
   */
  public checkUniqueDataset(datasetName: string): Observable<any> {
    const formData = new FormData();
    formData.append('name', datasetName);
    return this.httpClient.post(`http://127.0.0.1:8080/api/v2/support/unique-dataset`, formData);
  }


  /**
   * Get all dataset
   * @returns Observable of Http request
   */
  public getAllDataset(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:8080/api/v2/support/dataset');
  }

  /**
   * Get event nodes
   * @returns Observable of Http request
   */
  public getEventNodes(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/graph/nodes/event', { params: params });
  }

  /**
   * Get event nodes
   * @returns Observable of Http request
   */
  public getEntityNodes(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/graph/nodes/entity', { params: params });
  }

  /**
   * Get event nodes
   * @returns Observable of Http request
   */
  public getCorrRelationships(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/graph/relationships/corr', { params: params });
  }

  /**
   * Get event nodes
   * @returns Observable of Http request
   */
  public getDfRelationships(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/graph/relationships/df', { params: params });
  }

  // Get the Graph Entities (filtered column)
  public getGraphEntities(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/support/entities_key', { params: params });
  }

  // Get the NaN entities
  public getNaNEntities(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/support/null-entities', { params: params });
  }

  /**
   * Get only info about the graph
   * @returns Observable of Http request
   */
  public getGraphDetilsInfo(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/graph/details/info', { params: params });
  }

  /**
   * Get standard graph details
   * @param lenght the max nodes-links
   * @returns Observable of Http request
   */
  public getMinorGraphDetails(limit: number, datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get(`http://127.0.0.1:8080/api/v2/graph/minor-details?limit=${limit}`, { params: params })
  }

  /**
   * Get standard graph details
   * @returns Observable of Http request
   */
  public getCompleteGraphDetails(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/graph/details', { params: params });
  }

  /**
   * Delete the standard graph by the Database
   * @returns Observable of Http request
   */
  public deleteGraph(datasetName: string): Observable<any> {
    const formData: FormData = new FormData();
    formData.append('dataset_name', datasetName);

    return this.httpClient.post('http://127.0.0.1:8080/api/v2/graph/delete', formData);
  }

  // --------SUPPORT METHODS---------

  /**
   * Set the response of the first operation
   * @param response the response of http.
   */
  public saveResponse(response: any): void {
    this.apiResponse = response;
  }

  /**
   * Save the dataset name
   * @param datasetName the dataset name
   */
  public saveDatasetName(datasetName: string): void {
    this.datasetName = datasetName;
  }

  // Delete the response http.
  public deleteResponse(): void {
    this.apiResponse = undefined;
  }

  // Get the response http.
  public getResponse(): any {
    return this.apiResponse;
  }

  // Return if there is response.
  public hasResponse(): boolean {
    return !(this.apiResponse == undefined || false);
  }
}
