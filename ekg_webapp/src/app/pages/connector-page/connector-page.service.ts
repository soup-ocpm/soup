import { HttpClient } from "@angular/common/http";
import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class ConnectorPageService {

    
    /**
    * Constructor of ConnectorPageService service class.
    * @param httpClient the HttpClient for Request-Response.
    */
    constructor(
        private httpClient: HttpClient
    ) { }


    /**
     * Method that allow to call Backend for 
     * connect User in his Neo4J Aura database.
     * @param uri the uri of Neo4j database.
     * @param instanceId the instance id of Neo4j database.
     * @param instanceName the instance name of Neo4j database.
     * @param username the username of Neo4j database.
     * @param password the password of Neo4j database.
     */
    public connectToDatabase(uri: String, instanceId: String, instanceName: String, username: String, password: String) {
        return this.httpClient.post('http://localhost:5000/api/v1/connect', {
            uri,
            instanceId,
            instanceName,
            username,
            password
        });
    }
}