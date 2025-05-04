import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import { ApiResponse } from '../core/models/api_response.model';
import { ApiService } from '../core/services/api_response.service';

/**
 * Analysis service
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class AnalysisService {
  /**
   * Initialize a new instance of AnalysisService service
   * @param apiService the ApiService service
   */
  constructor(private apiService: ApiService) {}

  /**
   * Create new analysis
   * @param filterData the content
   * @returns an Observable of ApiResponse object
   */
  public createAnalysis(filterData: any): Observable<ApiResponse<any>> {
    return this.apiService.post(`${environment.baseUrl}/analyses/new`, filterData);
  }

  /**
   * Process specific analysis
   * @param datasetName the dataset name
   * @param analysisName the analysis name
   * @returns an Observable of ApiResponse object
   */
  public processAnalysis(datasetName: string, analysisName: string): Observable<ApiResponse<any>> {
    // Create body object
    const bodyRequest = {
      dataset_name: datasetName,
      analysis_name: analysisName
    };

    return this.apiService.post(`${environment.baseUrl}/analyses`, bodyRequest);
  }

  /**
   * Check unique name for analysis
   * @param datasetName the dataset name
   * @param analysisName the analysis name
   * @returns an Observable of ApiResponse object
   */
  public checkUniqueAnalysisName(datasetName: string, analysisName: string): Observable<ApiResponse<any>> {
    // Create body object
    const bodyRequest = {
      dataset_name: datasetName,
      analysis_name: analysisName
    };

    return this.apiService.post(`${environment.baseUrl}/analyses/unique`, bodyRequest);
  }

  /**
   * Calculate the frequency
   * @param frequency the frequency
   * @returns an Observable of ApiResponse object
   */
  public calculateFrequencyFilter(frequency: number): Observable<ApiResponse<any>> {
    // Create body object
    const bodyRequest = {
      frequency: frequency
    };

    return this.apiService.post(`${environment.baseUrl}/analyses/frequency`, bodyRequest);
  }

  /**
   * Calculate the variation
   * @returns an Observable of ApiResponse object
   */
  public calculateVariationFilter(): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/analyses/variation`);
  }

  /**
   * Get all analyses
   * @param datasetName the dataset name
   * @returns an Observable of ApiResponse object
   */
  public getAllAnalyses(datasetName: string): Observable<ApiResponse<any>> {
    return this.apiService.get(`${environment.baseUrl}/analyses?dataset_name=${datasetName}`);
  }

  /**
   * Delete specific analysis
   * @param datasetName the dataset name
   * @param analysisName the analysis name
   * @returns an Observable of ApiResponse object
   */
  public deleteAnalysis(datasetName: string, analysisName: string): Observable<ApiResponse<any>> {
    // Create body object
    const bodyRequest = {
      dataset_name: datasetName,
      analysis_name: analysisName
    };

    return this.apiService.post(`${environment.baseUrl}/analyses/delete`, bodyRequest);
  }
}
