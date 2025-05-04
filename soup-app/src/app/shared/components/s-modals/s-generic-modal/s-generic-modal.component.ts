import { SpBtnTxtComponent } from '@aledevsharp/sp-lib';
import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, OnInit, Output } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ModalService } from '../modal.service';

/**
 * Generic modal component
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-s-generic-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    // Components import
    SpBtnTxtComponent
  ],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [style({ top: '-300px', opacity: 0 }), animate('0.3s ease-out', style({ top: '55px', opacity: 1 }))]),
      transition(':leave', [animate('0.3s ease-in', style({ top: '-300px', opacity: 0 }))])
    ])
  ],
  templateUrl: './s-generic-modal.component.html',
  styleUrl: './s-generic-modal.component.scss'
})
export class GenericModalComponent implements OnInit {
  // The modal title
  public title = '';

  // The modal message
  public message = '';

  // If the modal is composed by two button actions
  public doubleButton = false;

  // The principal button text
  public primaryButtonText = '';

  // The principal button color
  public primaryButtonColor = '';

  // The secondary button text
  public secondaryButtonText = '';

  // The secondary button color
  public secondaryButtonColor = '';

  // If we want to include a generic input
  public showInput = false;

  // The input label
  public inputLabel = '';

  // Handle the output
  @Output() primaryButtonClick!: () => void;

  // Handle the output with value
  @Output() primaryButtonClickWithInput?: (value: any) => Promise<any>;

  // Handle the second output
  @Output() secondaryButtonClick!: () => void | null;

  // The input value if exist an input field
  public inputValue = '';

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
        this.showInput = modal.showInput;
        this.inputLabel = modal.inputLabel;
        this.primaryButtonText = modal.primaryButtonText;
        this.primaryButtonColor = modal.primaryButtonColor;
        this.secondaryButtonText = modal.secondaryButtonText;
        this.secondaryButtonColor = modal.secondaryButtonColor;
        this.primaryButtonClick = modal.primaryButtonClick;
        this.primaryButtonClickWithInput = modal.primaryButtonClickWithInput;
        this.secondaryButtonClick = modal.secondaryButtonClick;
        this.isVisible = true;
      }
    });
  }

  /**
   * Click to te primary button
   */
  public onClickPrimaryButton(): void {
    if (!this.showInput) {
      if (typeof this.primaryButtonClick === 'function') {
        this.primaryButtonClick();
      }
    } else {
      if (typeof this.primaryButtonClickWithInput === 'function') {
        this.primaryButtonClickWithInput(this.inputValue).then(() => {
          this.closeVisible();
        });
      }
    }

    this.closeVisible();
  }

  /**
   * Click to the secondary button
   */
  public onClickSecondaryButton(): void {
    if (typeof this.secondaryButtonClick === 'function') {
      this.secondaryButtonClick();
    }

    this.closeVisible();
  }

  /**
   * Set the visible flag to false
   */
  public closeVisible(): void {
    this.isVisible = false;
  }
}
