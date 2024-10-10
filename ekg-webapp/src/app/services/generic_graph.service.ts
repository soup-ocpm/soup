import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class GenericGraphService {

    /**
     * Initialize a new instance of GenericGraphService service
     * @param httpClient the HttpClient client
     */
    constructor(private httpClient: HttpClient) { }

    /**
     * Get full Class graph
     * @returns Observable of Http request
    */
    public getGraph(type: string, limit: number | any, datasetName: string): Observable<any> {
        return this.httpClient.post(`http://127.0.0.1:8080/api/v2/complete-graph?limit=${limit}`, { 'standard_graph': type, 'dataset_name': datasetName });
    }
}