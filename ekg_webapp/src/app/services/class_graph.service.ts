import { HttpClient } from "@angular/common/http";
import { Injectable } from '@angular/core';
import { Observable } from "rxjs";


@Injectable({
    providedIn: 'root',
})
export class ClassGraphService {

    /**
     * Constructor of ClassGraphService service
     * @param httpClient the Http client
     */
    constructor(
        private httpClient: HttpClient
    ) { }


    /**
     * Create class graph
     * @param formData the FormData data
     * @param filteredColumn the filtered column
     * @returns Observable of Http request
     */
    public createClassGraph(formData: FormData, filteredColumn: string[]): Observable<any> {
        filteredColumn.push('ActivityName');
        formData.append('filteredColumn', JSON.stringify(filteredColumn));
        return this.httpClient.post('http://127.0.0.1:8080/api/v1/graph-class', formData);
    }

    /**
     * Get Class ndes
     * @returns Observable of Http request
     */
    public getClassNodes(): Observable<any> {
        return this.httpClient.get('http://127.0.0.1:8080/api/v1/graph-class/nodes/class');
    }

    /**
     * Get full Class graph
     * @returns Observable of Http request
     */
    public getClassGraph(): Observable<any> {
        return this.httpClient.get('http://127.0.0.1:8080/api/v1/graph-class');
    }

    /**
     * Delete the class graph by the Database
     * @returns Observable of Http request
     */
    public deleteClassGraph(): Observable<any> {
        return this.httpClient.delete('http://127.0.0.1:8080/api/v1/graph-class');
    }
}
