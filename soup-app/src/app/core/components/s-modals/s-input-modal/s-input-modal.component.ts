import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { DatasetService } from '../../../../services/datasets.service';
import { MaterialModule } from '../../../../shared/modules/materlal.module';
import { LoggerService } from '../../../services/logger.service';
import { SButtonTComponent } from '../../s-buttons/s-button-t/s-button-t.component';
import { ModalService } from '../modal.service';

@Component({
  selector: 'app-s-input-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    // Components import
    SButtonTComponent
  ],
  templateUrl: './s-input-modal.component.html',
  styleUrl: './s-input-modal.component.scss'
})
export class InputModalComponent implements OnInit {
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

  // The container id
  @Input() containerId = '';

  // Handle the output
  @Output() primaryButtonClick!: (datasetName: string, datasetDescription: string, saveProcessExecution: boolean) => Promise<any>;

  // Handle the second output
  @Output() secondaryButtonClick!: () => void | null;

  // The form
  public datasetForm!: FormGroup;

  // The input value for the name
  public datasetName = '';

  // The input value for the description
  public datasetDescription = '';

  // Save the process execution query
  public saveProcessExecution = true;

  // If the form have error
  public hasError = false;

  // The error message
  public errorMessage = '';

  // If the modal is visible or not
  public isVisible = false;

  /**
   * Constructor for DeleteModalComponent component
   * @param formBuilder the FormBuilder
   * @param loggerService the LoggerService service
   * @param modalService the ModalService service
   * @param datasetService the DatasetService service
   */
  constructor(
    private formBuilder: FormBuilder,
    private loggerService: LoggerService,
    private modalService: ModalService,
    private datasetService: DatasetService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.datasetForm = this.formBuilder.group({
      datasetName: ['', [Validators.required, Validators.minLength(3)]]
    });

    this.modalService.inputModalState.subscribe((modal) => {
      if (modal) {
        this.title = modal.title;
        this.message = modal.message;
        this.doubleButton = modal.doubleButton;
        this.primaryButtonText = modal.primaryButtonText;
        this.primaryButtonColor = modal.primaryButtonColor;
        this.secondaryButtonText = modal.secondaryButtonText;
        this.secondaryButtonColor = modal.secondaryButtonColor;
        this.containerId = modal.containerId;
        this.primaryButtonClick = modal.primaryButtonClick;
        this.secondaryButtonClick = modal.secondaryButtonClick;
        this.isVisible = true;
      }
    });
  }

  /**
   * Click to the primary button
   * @returns a void promise
   */
  public async onClickPrimaryButton(): Promise<void> {
    this.hasError = false;
    this.errorMessage = '';

    if (typeof this.primaryButtonClick === 'function') {
      if (this.datasetName === '' || this.datasetName == null) {
        this.hasError = true;
        this.errorMessage = 'Please enter a valid value';
        return;
      }
      this.checkUniqueName();
    }
  }

  /**
   * Check the dataset unique name
   */
  private checkUniqueName(): void {
    this.datasetService.checkUniqueDataset(this.datasetName).subscribe({
      next: (response) => {
        if (response.statusCode === 202) {
          this.primaryButtonClick(this.datasetName, this.datasetDescription, this.saveProcessExecution)
            .then(() => {
              this.isVisible = false;
            })
            .catch((error) => {
              this.hasError = true;
              this.errorMessage = error;
            });
        } else if (response.statusCode == 200) {
          this.hasError = true;
          this.errorMessage = 'Dataset name already exists. Please retry';
        }
      },
      error: (error) => {
        const errorData: any = error;
        this.loggerService.error(errorData);
        this.hasError = true;
        this.errorMessage = 'Dataset name already exists. Please retry';
      },
      complete: () => {}
    });
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

  /**
   * Input change
   */
  public onInputChange(): void {
    if (this.hasError) {
      this.hasError = false;
    }
  }
}
