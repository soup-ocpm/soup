import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api_response.model';
import { ApiService } from './api_response.service';

/**
 * Engine service
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class EngineService {
  // Connection status with the Engine
  private engineConnection = false;

  // Connection status with the Memgraph (in Docker)
  private memgraphConnection = false;

  /**
   * Initialize a new instance of EngineService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Test the connection with the Engine
   * @return Observable of ApiResponse object
   */
  public testEngineConnection(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/welcome`);
  }

  /**
   * Return the engine connection status
   * @returns the engine connection status
   */
  public getEngineConnection(): boolean {
    return this.engineConnection;
  }

  /**
   * Set the engine connection statud
   * @param status the engine connection status
   */
  public setEngineConnection(status: boolean): void {
    this.engineConnection = status;
  }

  /**
   * Test the connection with the Memgraph database
   * @returns Observable of ApiResponse object
   */
  public testMemgraphConnection(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/memgraph-connect`);
  }

  /**
   * Return the success connection
   * @returns memgraph connection status
   */
  public getMemgraphConnection(): boolean {
    return this.memgraphConnection;
  }

  /**
   * Set the memgraph connection status
   * @param status the memgraph connection status
   */
  public setMemgraphConnection(status: boolean): void {
    this.memgraphConnection = status;
  }
}
