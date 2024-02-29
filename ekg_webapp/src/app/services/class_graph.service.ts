import { HttpClient } from "@angular/common/http";
import { Injectable } from '@angular/core';
import { Observable } from "rxjs";


@Injectable({
    providedIn: 'root',
})
export class ClassGraphService {

    // Save the first API Response of standard graph details
    public apiResponse: any | undefined;

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

    // --------SUPPORT METHODS---------

    /**
     * Set the response response of the first operation
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
        if (this.apiResponse == undefined || this.apiResponse == null) {
            return false;
        }
        return true;
    }
}
