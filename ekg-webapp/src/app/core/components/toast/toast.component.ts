import {Component, OnInit, Input} from '@angular/core';

// Services import
import {NotificationService} from "../../../services/notification.service";

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss'
})
export class ToastComponent implements OnInit {

  // Input the message for Toast
  @Input() message: string = '';

  // If it is success or danger message
  @Input() success: boolean = true;

  // The time for hide
  @Input() hideTime: number = 3000;

  // Move the Toast outside the Sidebar
  @Input() isSidebarOpens: boolean = false;

  /**
   * Constructor for ToastComponent component
   * @param messageService the NotificationService service
   */
  constructor(
    private messageService: NotificationService
  ) {
  }

  // NgOnInit implementation
  ngOnInit(): void {
    this.messageService.toastState.subscribe((toast) => {
      if (toast) {
        this.message = toast.message;
        this.success = toast.success;
        this.hideTime = toast.time;
        this.show();
      }
    });
  }

  // Show the Toast message
  public show() {
    const toastElement: Element | null = document.querySelector('.toast');
    if (toastElement) {
      toastElement.classList.add('show');
      setTimeout(() => {
        this.hide();
      }, this.hideTime);
    }
  }

  // Hide the Toast message
  public hide() {
    const toastElement: Element | null = document.querySelector('.toast');
    if (toastElement) {
      toastElement.classList.remove('show');
    }
  }
}
