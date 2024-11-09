import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api_response.model';
import { ApiService } from './api_response.service';

@Injectable({
  providedIn: 'root'
})
export class EngineService {
  // Success connection with the Engine
  private successConnection = false;

  /**
   * Initialize a new instance of EngineService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Test the connection with the Engine
   */
  public testEngineConnection(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/welcome`);
  }

  /**
   * Return the success connection
   * @returns the success connection status
   */
  public getSuccessConnection(): boolean {
    return this.successConnection;
  }

  /**
   * Set the success connection status
   * @param success the success connection status
   */
  public setSuccessConnection(success: boolean): void {
    this.successConnection = success;
  }
}
