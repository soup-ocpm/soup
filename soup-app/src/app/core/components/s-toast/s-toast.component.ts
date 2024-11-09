import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';

import { ToastLevel } from '../../enums/toast_type.enum';
import { NotificationService } from '../../services/toast.service';

@Component({
  selector: 'app-s-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './s-toast.component.html',
  styleUrl: './s-toast.component.scss'
})
export class SToastComponent implements OnInit {
  // Input the message for Toast
  @Input() message = '';

  // If it is success or danger message
  @Input() toastLevel: ToastLevel = ToastLevel.Success;

  // The time for hide
  @Input() hideTime = 3000;

  // Move the Toast outside the Sidebar
  @Input() isSidebarOpens = false;

  /**
   * Constructor for ToastComponent component
   * @param messageService the NotificationService service
   */
  constructor(private messageService: NotificationService) {}

  // NgOnInit implementation
  ngOnInit(): void {
    this.messageService.toastState.subscribe((toast) => {
      if (toast) {
        this.message = toast.message;
        this.toastLevel = toast.toastLevel;
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
