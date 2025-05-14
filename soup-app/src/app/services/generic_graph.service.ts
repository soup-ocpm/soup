import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';
import { GraphType } from '../enums/graph_type.enum';

/**
 * Generic graph service
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class GenericGraphService {
  /**
   * Initialize a new instance of GenericGraphService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Create the dataset graphs (standard and graph it exists )
   * @param containerId the container id
   * @param datasetName the dataset name
   * @returns an Observable of ApiResponse object
   */
  public createDatasetGraphs(datasetName: string): Observable<ApiResponse<any>> {
    // Create the body object
    const bodyRequest = {
      dataset_name: datasetName
    };

    return this.apiService.post(`${environment.baseUrl}/complete-graph/build`, bodyRequest);
  }

  /**
   * Get graph data
   * @param limit the limit
   * @param standardGraph if we want to retrieve the standard graph
   * @returns an Observable of ApiResponse object
   */
  public getGraph(limit: number, standardGraph: string): Observable<ApiResponse<any>> {
    // Create the body object
    const bodyRequest = {
      standard_graph: standardGraph
    };

    return this.apiService.post(`${environment.baseUrl}/complete-graph?limit=${limit}`, bodyRequest);
  }

  /**
   * Get the maximum data to show in the graph
   */
  public getMaxDataGraphToShow(graphType: GraphType): Observable<ApiResponse<any>> {
    // Create the body object
    const data = graphType === GraphType.Standard ? '1' : '0';
    const bodyRequest = {
      standard_graph: data
    };

    return this.apiService.post(`${environment.baseUrl}/complete-graph/max-data`, bodyRequest);
  }

  /**
   * Remove the memgraph data
   * @returns an Observable of ApiResponse object
   */
  public removeMemgraphData(): Observable<ApiResponse<any>> {
    return this.apiService.delete(`${environment.baseUrl}/complete-graph`);
  }
}
