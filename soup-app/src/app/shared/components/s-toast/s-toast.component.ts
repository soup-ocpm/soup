import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { NotificationService } from './toast.service';
import { ToastLevel } from './toast_type.enum';

/**
 * Toast message component
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-s-toast',
  standalone: true,
  imports: [CommonModule],
  animations: [
    trigger('toastAnimation', [
      transition(':enter', [style({ opacity: 0, bottom: '-70px' }), animate('0.5s ease-out', style({ opacity: 1, bottom: '20px' }))]),
      transition(':leave', [animate('0.5s ease-in', style({ opacity: 0, bottom: '-70px' }))])
    ])
  ],
  templateUrl: './s-toast.component.html',
  styleUrl: './s-toast.component.scss'
})
export class SToastComponent implements OnInit {
  // Input the title for Toast
  public title = '';

  // Input the message for Toast
  public message = '';

  // If we want to include the close icon
  public closeIcon = false;

  // If we want to include the help icon
  public helpIcon = false;

  // The external link for help icon
  public externalLink = '';

  // If it is success or danger message
  public toastLevel: ToastLevel = ToastLevel.Success;

  // The time for hide
  public hideTime = 3000;

  // Move the Toast outside the Sidebar
  public isSidebarOpens = false;

  /**
   * Constructor for ToastComponent component
   * @param messageService the NotificationService service
   */
  constructor(private messageService: NotificationService) {}

  // NgOnInit implementation
  ngOnInit(): void {
    this.messageService.toastState.subscribe((toast) => {
      if (toast) {
        this.title = toast.title;
        this.message = toast.message;
        this.closeIcon = toast.closeIcon;
        this.helpIcon = toast.helpIcon;
        this.externalLink = toast.externalLink;
        this.toastLevel = toast.toastLevel;
        this.hideTime = toast.time;
        this.show();
      }
    });
  }

  /**
   * Show the toast
   */
  public show(): void {
    const toastElement: Element | null = document.querySelector('.toast');
    if (toastElement) {
      toastElement.classList.add('show');

      if (!this.closeIcon) {
        setTimeout(() => {
          this.hide();
        }, this.hideTime);
      }
    }
  }

  /**
   * Close the toast with the button
   */
  public closeToast(): void {
    this.hide();
  }

  /**
   * Open the external link
   */
  public openLink(): void {
    window.open(this.externalLink, '_blank', 'noopener');
  }

  /**
   * Hide the toast
   */
  public hide(): void {
    const toastElement: Element | null = document.querySelector('.toast');

    if (toastElement) {
      toastElement.classList.remove('show');
    }
  }
}
