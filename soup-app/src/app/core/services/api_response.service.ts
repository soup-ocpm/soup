import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';

import { ApiResponse } from '../models/api_response.model';

/**
 * Api service
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  /**
   * Initialize a new instance of ApiService service
   * @param http the HttpClient client
   */
  constructor(private http: HttpClient) {}

  /**
   * Perform a GET request
   * @param url the url of the API
   * @param params the params
   * @returns an ApiResponse object
   */
  public get<T>(url: string, params?: HttpParams): Observable<ApiResponse<T>> {
    return this.http.get(url, { params }).pipe(
      map((response) => this.handleResponse<T>(response)),
      catchError((error) => {
        // Catch and propagate the error
        return throwError(() => this.handleError<T>(error));
      })
    );
  }

  /**
   * Perform a POST request
   * @param url the url of the API
   * @param body the body of the request
   * @param headers the headers
   * @returns an ApiResponse object
   */
  public post<T>(url: string, body: any, headers?: HttpHeaders): Observable<ApiResponse<T>> {
    return this.http.post<ApiResponse<T>>(url, body, { headers }).pipe(
      map((response) => this.handleResponse<T>(response)),
      catchError((error) => {
        // Catch and propagate the error
        return throwError(() => this.handleError<T>(error));
      })
    );
  }

  /**
   * Perform a PUT request
   * @param url the url of the API
   * @param body the body of the request
   * @param headers the headers
   * @returns an ApiResponse object
   */
  public put<T>(url: string, body: any, headers?: HttpHeaders): Observable<ApiResponse<T>> {
    return this.http.put(url, body, { headers }).pipe(
      map((response) => this.handleResponse<T>(response)),
      catchError((error) => {
        // Catch and propagate the error
        return throwError(() => this.handleError<T>(error));
      })
    );
  }

  /**
   * Perform a DELETE request
   * @param url  the url of the API
   * @param params the parameters
   * @returns an ApiResponse object
   */
  public delete<T>(url: string, params?: HttpParams): Observable<ApiResponse<T>> {
    return this.http.delete(url, { params }).pipe(
      map((response) => this.handleResponse<T>(response)),
      catchError((error) => {
        // Catch and propagate the error
        return throwError(() => this.handleError<T>(error));
      })
    );
  }

  /**
   * Handle the API response and create object
   * @param response the response
   * @returns an ApiResponse object
   */
  private handleResponse<T>(response: any): ApiResponse<T> {
    // Return the ApiResponse object
    return new ApiResponse(response.http_status_code, response.response_data, response.message);
  }

  /**
   * Handle the error API response and create object
   * @param error the error
   * @returns an ApiResponse object
   */
  private handleError<T>(error: any): ApiResponse<T> {
    const statusCode = error.status || 500;
    const message = error.error?.message || error.message || 'An unexpected error occurred';
    const responseData = error.error?.response_data ?? null;

    // Return the ApiResponse object
    return new ApiResponse<T>(statusCode, responseData, message);
  }
}
