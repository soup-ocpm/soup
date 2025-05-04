import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { ToastLevel } from './toast_type.enum';

/**
 * Toast service
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  // The Toast Subject
  private toastSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  // The Observable Toast Subject
  public toastState: Observable<any> = this.toastSubject.asObservable();

  // Initialize a new instance of NotificationService service
  constructor() {}

  /**
   * Show the Toast message
   * @param message the message
   * @param success the success or danger status
   * @param time the time for show message
   */
  public show(message: string, toastLevel: ToastLevel, time: number): void {
    this.toastSubject.next({ message, toastLevel, time });
  }

  /**
   * Show the Toast message with title
   * @param title the title
   * @param message the message
   * @param closeIcon the icon close
   * @param helpIcon the icon for help
   * @param externalLink the external link for the help
   * @param success the success or danger status
   * @param time the time for show message
   */
  public showWithTitle(
    title: string,
    message: string,
    closeIcon: boolean,
    helpIcon: boolean,
    externalLink: string | null,
    toastLevel: ToastLevel,
    time: number
  ): void {
    this.toastSubject.next({ title, message, closeIcon, helpIcon, externalLink, toastLevel, time });
  }
}
