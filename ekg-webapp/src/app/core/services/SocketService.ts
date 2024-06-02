import {Injectable} from "@angular/core";
import {Socket} from 'ngx-socket-io';
import {Observable} from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class SocketService {

  // Event emitter for progress and completed events
  public progress: Observable<any> = this.socket.fromEvent<any>('progress');
  public complete: Observable<any> = this.socket.fromEvent<any>('complete');
  public error: Observable<any> = this.socket.fromEvent<any>('error');

  /**
   * Initialize a new instance of SocketService service
   * @param socket
   */
  constructor(
    private socket: Socket
  ) {
  }

  // Send the socket message
  public sendSocketMessage(eventName: string, data: any) {
    this.socket.emit(eventName, data);
  }
}
