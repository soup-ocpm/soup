import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

@Injectable({
  providedIn: 'root'
})
export class DockerService {
  /**
   * Initialize a new instance of ClassGraphService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Get all available container
   */
  public containers(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/docker`);
  }

  /**
   * Get all active containers
   */
  public activeContainers(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/docker/active`);
  }

  /**
   * Get all exited containers
   */
  public exitedContainers(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/docker/exited`);
  }

  /**
   * Start specific container
   * @param containerId the container id
   */
  public startContainer(containerId: string): Observable<ApiResponse<any>> {
    const jsonRequest = { container_id: containerId };

    return this.apiService.post(`${environment.baseUrl}/docker/start`, jsonRequest);
  }

  /**
   * Stop specific container
   * @param containerId the container id
   */
  public stopContainer(containerId: string): Observable<ApiResponse<any>> {
    const jsonRequest = { container_id: containerId };

    return this.apiService.post(`${environment.baseUrl}/docker/stop`, jsonRequest);
  }
}
