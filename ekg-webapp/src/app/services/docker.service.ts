import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {Observable} from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class DockerService {
  /**
   * Initialize a new instance of ClassGraphService service
   * @param httpClient the Http client
   */
  constructor(
    private httpClient: HttpClient
  ) {
  }

  /**
   * Get all available container
   */
  public containers(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:5000/api/v2/docker');
  }

  /**
   * Get all active containers
   */
  public activeContainers(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:8080/api/v2/docker/active');
  }

  /**
   * Get all exited containers
   */
  public exitedContainers(): Observable<any> {
    return this.httpClient.get('http://127.0.0.1:8080/api/v2/docker/exited');
  }

  /**
   * Get all specific container directories
   * @param containerId the container id
   */
  public containerDirectories(containerId: string): Observable<any> {
    return this.httpClient.post('http://127.0.0.1:5000/api/v1/docker/directories', {'container_id': containerId});
  }

  /**
   * Start specific container
   * @param containerId the container id
   */
  public startContainer(containerId: string): Observable<any> {
    return this.httpClient.post('http://127.0.0.1:8080/api/v1/docker/start', {'container_id': containerId});
  }

  /**
   * Stop specific container
   * @param containerId the container id
   */
  public stopContainer(containerId: string): Observable<any> {
    return this.httpClient.post('http://127.0.0.1:8080/api/v1/docker/stop', {'container_id': containerId});
  }
}
