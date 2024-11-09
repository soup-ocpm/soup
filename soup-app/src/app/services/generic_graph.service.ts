import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

@Injectable({
  providedIn: 'root'
})
export class GenericGraphService {
  /**
   * Initialize a new instance of StandardGraphService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Create the dataset graphs (standard and graph it exists )
   * @param containerId the container id
   * @param datasetName the dataset name
   * @returns Observale of Http request
   */
  public createDatasetGraphs(containerId: string, datasetName: string): Observable<ApiResponse<any>> {
    const jsonRequest = {
      container_id: containerId,
      dataset_name: datasetName
    };

    return this.apiService.post(`${environment.baseUrl}/complete-graph/build`, jsonRequest);
  }

  /**
   * Get graph data
   * @param limit the limit
   * @param standardGraph if we want to retrieve the standard graph
   * @returns Observale of Http request
   */
  public getGraph(limit: number, standardGraph: string): Observable<ApiResponse<any>> {
    const jsonRequest = {
      standard_graph: standardGraph
    };

    return this.apiService.post(`${environment.baseUrl}/complete-graph?limit=${limit}`, jsonRequest);
  }

  /**
   * Remove the memgraph data
   * @returns Observale of Http request
   */
  public removeMemgraphData(): Observable<ApiResponse<any>> {
    return this.apiService.delete(`${environment.baseUrl}/complete-graph`);
  }
}
