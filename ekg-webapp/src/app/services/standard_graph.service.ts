import {HttpClient} from "@angular/common/http";
import {Observable} from "rxjs";
import {Injectable} from "@angular/core";

// Models import
import {Container} from "../core/models/container.model";

@Injectable({
  providedIn: 'root',
})
export class StandardGraphService {

  // Save the api response for the Guard and navigation
  public apiResponse: any;

  /**
   * Initialize a new instance of StandardGraphService service
   * @param httpClient the Http client
   */
  constructor(
    private httpClient: HttpClient
  ) {
  }

  /**
   * Create the standard graph
   * @param formData the FormData data
   * @param filteredColumn the filtered column
   * @param valuesColumn the values for node
   * @param fixed the fixed value column
   * @param variable the variable value column
   * @param container the docker container
   * @returns Observable of Http request
   */
  public createGraph(formData: FormData, filteredColumn: string[], valuesColumn: string[], fixed: string, variable: string, container: Container): Observable<any> {
    formData.append('filteredColumn', JSON.stringify(filteredColumn));
    formData.append('valuesColumn', JSON.stringify(valuesColumn));
    formData.append('fixed', JSON.stringify(fixed));
    formData.append('variable', JSON.stringify(variable));
    formData.append('container_id', container.id);
    return this.httpClient.post('http://127.0.0.1:5000/api/v2/graph', formData);
  }

  /**
   * Get event nodes
   * @returns Observable of Http request
   */
  public getEventNodes(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/graph/nodes/event');
  }

  /**
   * Get event nodes
   * @returns Observable of Http request
   */
  public getEntityNodes(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/graph/nodes/entity');
  }

  /**
   * Get event nodes
   * @returns Observable of Http request
   */
  public getCorrRelationships(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/graph/relationships/corr');
  }

  /**
   * Get event nodes
   * @returns Observable of Http request
   */
  public getDfRelationships(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/graph/relationships/df');
  }

  // Get the Graph Entities (filtered column)
  public getGraphEntities(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/support/entities_key');
  }

  // Get the NaN entities
  public getNaNEntities(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/support/null-entities');
  }

  /**
   * Get extended standard graph
   * @returns Observable of Http request
   */
  public getGraph(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/graph');
  }

  /**
   * Get standard graph details
   * @returns Observable of Http request
   */
  public getGraphDetails(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/graph/details');
  }

  /**
   * Delete the standard graph by the Database
   * @returns Observable of Http request
   */
  public deleteGraph(): Observable<any> {
    return this.httpClient.delete('http://127.0.0.1:5000/api/v2/graph');
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
    return !(this.apiResponse == undefined || false);
  }
}
