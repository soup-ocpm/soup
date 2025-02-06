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
   * @returns Observable of ApiResponse object
   */
  public containers(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/docker`);
  }

  /**
   * Get all active containers
   * @returns Observable of ApiResponse object
   */
  public activeContainers(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/docker/active`);
  }

  /**
   * Get all exited containers
   * @returns Observable of ApiResponse object
   */
  public exitedContainers(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/docker/exited`);
  }

  /**
   * Start specific container
   * @param containerId the container id
   * @returns Observable of ApiResponse object
   */
  public startContainer(containerId: string): Observable<ApiResponse<any>> {
    // Create body object
    const bodyRequest = { container_id: containerId };

    return this.apiService.post(`${environment.baseUrl}/docker/start`, bodyRequest);
  }

  /**
   * Stop specific container
   * @param containerId the container id
   * @returns Observable of ApiResponse object
   */
  public stopContainer(containerId: string): Observable<ApiResponse<any>> {
    // Create body object
    const bodyRequest = { container_id: containerId };

    return this.apiService.post(`${environment.baseUrl}/docker/stop`, bodyRequest);
  }
}
