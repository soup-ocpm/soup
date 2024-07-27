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
    public eventNodesJS(): Observable<any> {
        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/graph/event-nodes');
    }

    /**
     * Get entity nodes json
     * @returns Observable of Http request
    */
    public entityNodesJS(): Observable<any> {
        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/graph/entity-nodes');
    }

    /**
     * Get corr links
     * @returns Observable of Http request
    */
    public corrLinksJS(): Observable<any> {
        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/graph/corr-links');
    }

    /**
     * Get df links json
     * @returns Observable of Http request
    */
    public dfLinksJS(): Observable<any> {
        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/graph/df-links');
    }

    /**
     * Get class nodes json
     * @returns Observable of Http request
    */
    public classNodesJS(): Observable<any> {
        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/class-graph/class-nodes');
    }

    /**
     * Get df links json
     * @returns Observable of Http request
     */
    public dfcLinksJS(): Observable<any> {
        return this.httpClient.get('http://127.0.0.1:8080/api/v2/json/class-graph/class-df-links');
    }
}