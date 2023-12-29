import { HttpClient } from "@angular/common/http";
import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class GraphService {

    // Post response call for navigate User into new page.
    public apiResponse: any | undefined;


    /**
     * Constructor of LoadPageService service class.
     * @param httpClient the HttpClient for Request-Response.
     */
    public constructor(
        private httpClient: HttpClient
    ) { }


    /**
     * Method that send the filtered .csv file
     * to Backend.
     * @param file the filtered file.
     */
    public createStandardGraph(formData: FormData, filteredColumn: string[]) {
        formData.append('filteredColumn', JSON.stringify(filteredColumn));
        return this.httpClient.post('http://127.0.0.1:8080/api/v1/upload-csv', formData);
    }


    /**
     * 
     * @param formData 
     * @param filteredColumn 
     * @returns 
     */
    public createClassGraph(formData: FormData, filteredColumn: string[]) {
        filteredColumn.push('ActivityName');
        formData.append('filteredColumn', JSON.stringify(filteredColumn));
        return this.httpClient.post('http://127.0.0.1:8080/api/v1/upload-csv/class', formData);
    }


    /**
     * Method that send GET request to Backend for get the new
     * generated Graph.
     * @returns the http response.
     */
    public getStandardGraph() {
        return this.httpClient.get('http://127.0.0.1:8080/api/v1/graph');
    }


    /**
     * Method that send DELETE request to Backend for delete the
     * generated Graph.
     * @returns the http response.
     */
    public deleteGraph() {
        return this.httpClient.delete('http://127.0.0.1:8080/api/v1/graph');
    }


    /**
     * Set the response of getGraph call for AuthGuard.
     * @param response the response of http.
     */
    public saveResponse(response: any) {
        this.apiResponse = response;
    }


    // Delete the response http.
    public deleteResponse() {
        this.apiResponse = undefined;
    }


    // Get the response http.
    public getResponse() {
        return this.apiResponse;
    }


    // Return if there is response.
    public hasResponse() {
        if (this.apiResponse == undefined) {
            return false;
        }
        return true;
    }
}
