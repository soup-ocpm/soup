import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

/**
 * OnBoarding service
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class OnBoardingService {
  /**
   * Initialize a new instance of OnBoardingService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Retrieve the first time usage status
   * @returns an Observable of ApiResponse object
   */
  public getFirstTimeUsage(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/onboarding/first-time`);
  }

  /**
   * Set the firs time usage
   * @returns an Observable of ApiResponse object
   */
  public setFirstTimeUsage(): Observable<ApiResponse<any>> {
    return this.apiService.post(`${environment.baseUrl}/onboarding/first-time`, {});
  }
}
