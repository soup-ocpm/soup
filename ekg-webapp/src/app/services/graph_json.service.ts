import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class GraphJSONService {

    /**
     * Initialize a new instance of GenericGraphService service
     * @param httpClient the HttpClient client
     */
    constructor(private httpClient: HttpClient) { }

    /**
     * Get event nodes json
     * @returns Observable of Http request
    */
    public eventNodesJS(datasetName: string): Observable<any> {
        const params = {
            dataset_name: datasetName
        }

        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/graph/event-nodes', { params: params });
    }

    /**
     * Get entity nodes json
     * @returns Observable of Http request
    */
    public entityNodesJS(datasetName: string): Observable<any> {
        const params = {
            dataset_name: datasetName
        }

        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/graph/entity-nodes', { params: params });
    }

    /**
     * Get corr links
     * @returns Observable of Http request
    */
    public corrLinksJS(datasetName: string): Observable<any> {
        const params = {
            dataset_name: datasetName
        }

        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/graph/corr-links', { params: params });
    }

    /**
     * Get df links json
     * @returns Observable of Http request
    */
    public dfLinksJS(datasetName: string): Observable<any> {
        const params = {
            dataset_name: datasetName
        }

        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/graph/df-links', { params: params });
    }

    /**
     * Get class nodes json
     * @returns Observable of Http request
    */
    public classNodesJS(datasetName: string): Observable<any> {
        const params = {
            dataset_name: datasetName
        }

        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/class-graph/class-nodes', { params: params });
    }

    /**
     * Get df links json
     * @returns Observable of Http request
     */
    public dfcLinksJS(datasetName: string): Observable<any> {
        const params = {
            dataset_name: datasetName
        }
        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/class-graph/class-df-links', { params: params });
    }
}