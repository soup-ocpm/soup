import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';

import { ModalService } from '../modal.service';

/**
 * Delete modal component
 * @version 1.0
 * @since 2.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-s-delete-dataset-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    // Components import
    SpBtnComponent
  ],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [style({ top: '-300px', opacity: 0 }), animate('0.3s ease-out', style({ top: '55px', opacity: 1 }))]),
      transition(':leave', [animate('0.3s ease-in', style({ top: '-300px', opacity: 0 }))])
    ])
  ],
  templateUrl: './s-delete-dataset-modal.component.html',
  styleUrl: './s-delete-dataset-modal.component.scss'
})
export class DeleteDatasetModalComponent implements OnInit {
  // The modal title
  public title = '';

  // The modal message
  public message = '';

  // The dataset name
  public datasetName = '';

  // If the modal is fot delete dataset or analysis
  public isForDataset = false;

  // The principal button text
  public primaryButtonText = '';

  // The principal button color
  public primaryButtonColor = '';

  // The secondary button text
  public secondaryButtonText = '';

  // The secondary button color
  public secondaryButtonColor = '';

  // Handle the output
  @Output() primaryButtonClick!: (name: string) => Promise<any>;

  // Handle the second output
  @Output() secondaryButtonClick!: () => void | null;

  // The form
  public genericInputForm!: FormGroup;

  // The input value for the name
  public name = '';

  // If the modal is visible or not
  public isVisible = false;

  /**
   * Constructor for DeleteModalComponent component
   * @param formBuilder the FormBuilder
   * @param modalService the ModalService service
   */
  constructor(
    private formBuilder: FormBuilder,
    private modalService: ModalService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    // The form builder
    this.genericInputForm = this.formBuilder.group({
      name: ['', Validators.required]
    });

    // Subscription to the modal
    this.modalService.deleteDatasetModalState.subscribe((modal) => {
      if (modal) {
        this.title = modal.title;
        this.message = modal.message;
        this.datasetName = modal.datasetName;
        this.isForDataset = modal.isForDataset;
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
    const nameSelected = this.name;

    if (typeof this.primaryButtonClick === 'function') {
      this.name = '';
      this.primaryButtonClick(nameSelected);
    }

    this.closeVisible();
    this.genericInputForm.reset();
  }

  /**
   * Click to the secondary button
   */
  public onClickSecondaryButton(): void {
    if (typeof this.secondaryButtonClick === 'function') {
      this.name = '';
      this.secondaryButtonClick();
    }

    this.closeVisible();
    this.genericInputForm.reset();
  }

  /**
   * If the input name and dataset name match
   */
  public nameMatched(): boolean {
    return this.name === this.datasetName;
  }

  /**
   * Set the visible flag to false
   */
  public closeVisible(): void {
    this.isVisible = false;
  }
}
