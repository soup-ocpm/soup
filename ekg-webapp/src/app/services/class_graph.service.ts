import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ClassGraphService {

  // Save the api response for the Guard and navigation
  public apiResponse: any;

  /**
   * Initialize a new instance of ClassGraphService service
   * @param httpClient the Http client
   */
  constructor(
    private httpClient: HttpClient
  ) {
  }

  /**
   * Create class graph
   * @param formData the FormData data
   * @param filteredColumn the filtered column
   * @returns Observable of Http request
   */
  public createClassGraph(formData: FormData, filteredColumn: string[], datasetName: string): Observable<any> {
    filteredColumn.push('ActivityName');
    formData.append('filteredColumn', JSON.stringify(filteredColumn));
    formData.append('dataset_name', datasetName);

    return this.httpClient.post('http://127.0.0.1:8080/api/v2/graph-class', formData);
  }

  /**
   * Get Class nodes
   * @returns Observable of Http request
   */
  public getClassNodes(datasetName: string): Observable<any> {
    const params = {
      dataset_name: datasetName
    }

    return this.httpClient.get('http://127.0.0.1:8080/api/v2/graph-class/nodes/class', { params: params });
  }

  /**
   * Delete the class graph by the Database
   * @returns Observable of Http request
   */
  public deleteClassGraph(datasetName: string): Observable<any> {
    const formData: FormData = new FormData();
    formData.append('dataset_name', datasetName);
    return this.httpClient.post('http://127.0.0.1:8080/api/v2/graph-class/delete', formData);
  }

  // --------SUPPORT METHODS---------

  /**
   * Set the response of the first operation
   * @param response the response of http.
   */
  public saveResponse(response: any): void {
    this.apiResponse = response;
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
    return this.apiResponse != undefined;
  }
}
