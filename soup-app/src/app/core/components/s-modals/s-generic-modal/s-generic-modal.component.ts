import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, Output } from '@angular/core';

import { SButtonTComponent } from '../../s-buttons/s-button-t/s-button-t.component';
import { ModalService } from '../modal.service';

@Component({
  selector: 'app-s-generic-modal',
  standalone: true,
  imports: [
    CommonModule,
    // Components import
    SButtonTComponent
  ],
  templateUrl: './s-generic-modal.component.html',
  styleUrl: './s-generic-modal.component.scss'
})
export class GenericModalComponent implements OnInit {
  // The modal title
  @Input() title = '';

  // The modal message
  @Input() message = '';

  // If the modal is composed by two button actions
  @Input() doubleButton = false;

  // The principal button text
  @Input() primaryButtonText = '';

  // The principal button color
  @Input() primaryButtonColor = '';

  // The secondary button text
  @Input() secondaryButtonText = '';

  // The secondary button color
  @Input() secondaryButtonColor = '';

  // Handle the output
  @Output() primaryButtonClick!: () => void;

  // Handle the second output
  @Output() secondaryButtonClick!: () => void | null;

  // If the modal is visible or not
  public isVisible = false;

  /**
   * Constructor for DeleteModalComponent component
   * @param modalService the ModalService service
   */
  constructor(private modalService: ModalService) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.modalService.genericModalState.subscribe((modal) => {
      if (modal) {
        this.title = modal.title;
        this.message = modal.message;
        this.doubleButton = modal.doubleButton;
        this.primaryButtonText = modal.primaryButtonText;
        this.primaryButtonColor = modal.primaryButtonColor;
        this.secondaryButtonText = modal.secondaryButtonText;
        this.secondaryButtonColor = modal.secondaryButtonColor;
        this.primaryButtonClick = modal.primaryButtonClick;
        this.secondaryButtonClick = modal.secondaryButtonClick;
        this.isVisible = true;
      }
    });
  }

  /**
   * Click to te primary button
   */
  public onClickPrimaryButton(): void {
    if (typeof this.primaryButtonClick === 'function') {
      this.primaryButtonClick();
    }
    this.isVisible = false;
  }

  /**
   * Click to the secondary button
   */
  public onClickSecondaryButton(): void {
    if (typeof this.secondaryButtonClick === 'function') {
      this.secondaryButtonClick();
    }
    this.isVisible = false;
  }
}
