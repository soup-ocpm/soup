import {Injectable} from "@angular/core";
import {BehaviorSubject, Observable} from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  // The Toast Subject
  private toastSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  // The Observable Toast Subject
  public toastState: Observable<any> = this.toastSubject.asObservable();

  // Initialize a new instance of NotificationService service
  constructor() {
  }

  /**
   * Show the Toast message
   * @param message the message
   * @param success the success or danger status
   * @param time the time for show message
   */
  public show(message: string, success: boolean, time: number) {
    this.toastSubject.next({message, success, time});
  }
}
