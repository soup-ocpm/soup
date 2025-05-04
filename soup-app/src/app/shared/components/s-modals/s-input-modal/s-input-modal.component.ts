import { SpBtnTxtComponent } from '@aledevsharp/sp-lib';
import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { LoggerService } from 'src/app/core/services/logger.service';
import { AnalysisService } from 'src/app/services/analysis.service';

import { DatasetService } from '../../../../services/datasets.service';
import { MaterialModule } from '../../../../shared/modules/materlal.module';
import { ModalService } from '../modal.service';

/**
 * Input modal component
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-s-input-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    // Components import
    SpBtnTxtComponent
  ],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [style({ top: '-300px', opacity: 0 }), animate('0.3s ease-out', style({ top: '55px', opacity: 1 }))]),
      transition(':leave', [animate('0.3s ease-in', style({ top: '-300px', opacity: 0 }))])
    ])
  ],
  templateUrl: './s-input-modal.component.html',
  styleUrl: './s-input-modal.component.scss'
})
export class InputModalComponent implements OnInit {
  // The modal title
  public title = '';

  // The modal message
  public message = '';

  // If the modal is composed by two button actions
  public doubleButton = false;

  // The dataset name
  public datasetName = '';

  // If the modal is for create dataset or analysis
  public isForDataset = true;

  // The principal button text
  public primaryButtonText = '';

  // The principal button color
  public primaryButtonColor = '';

  // The secondary button text
  public secondaryButtonText = '';

  // The secondary button color
  public secondaryButtonColor = '';

  // The container id
  public containerId = '';

  // Handle the output
  @Output() primaryButtonClick!: (name: string, description: string, saveProcessExecution: boolean) => Promise<any>;

  // Handle the second output
  @Output() secondaryButtonClick!: () => void | null;

  // The form
  public datasetForm!: FormGroup;

  // The input value for the name
  public name = '';

  // The input value for the description
  public description = '';

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
   * @param modalService the ModalService service
   * @param loggerService the LoggerService service
   * @param datasetService the DatasetService service
   * @param analysisService the AnalysisService service
   */
  constructor(
    private formBuilder: FormBuilder,
    private modalService: ModalService,
    private loggerService: LoggerService,
    private datasetService: DatasetService,
    private analysisService: AnalysisService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.datasetForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(3)]]
    });

    // Subscription the modal information
    this.modalService.inputModalState.subscribe((modal) => {
      if (modal) {
        this.title = modal.title;
        this.message = modal.message;
        this.doubleButton = modal.doubleButton;
        this.datasetName = modal.datasetName;
        this.isForDataset = modal.isForDataset;
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
      // Check the name
      if (this.name === '') {
        this.hasError = true;
        this.errorMessage = 'Please enter a valid name';
        return;
      }

      // Check the spaces
      if (/\s/.test(this.name)) {
        this.hasError = true;
        this.errorMessage = 'The name cannot contain spaces';
        return;
      }

      if (this.isForDataset) {
        this.checkUniqueDatasetName();
      } else {
        this.checkUniqueAnalysisName();
      }
    }
  }

  /**
   * Check the dataset unique name
   */
  private checkUniqueDatasetName(): void {
    this.datasetService.checkUniqueDataset(this.name).subscribe({
      next: (response) => {
        if (response.statusCode === 202) {
          const name = this.name;
          const description = this.description;

          this.name = '';
          this.description = '';
          this.primaryButtonClick(name, description, this.saveProcessExecution)
            .then(() => {
              this.isVisible = false;
            })
            .catch((error) => {
              this.hasError = true;
              this.errorMessage = error;
            });
        } else if (response.statusCode == 200) {
          this.hasError = true;
          this.errorMessage = 'Dataset name already exists. Please enter another name';
        }
      },
      error: (error) => {
        const errorData: any = error;
        this.loggerService.error(errorData);
      },
      complete: () => {}
    });
  }

  /**
   * Check the analysis unique name
   */
  public checkUniqueAnalysisName(): void {
    this.analysisService.checkUniqueAnalysisName(this.datasetName, this.name).subscribe({
      next: (response) => {
        if (response.statusCode === 202) {
          const name = this.name;
          const description = this.description;

          this.name = '';
          this.description = '';

          this.primaryButtonClick(name, description, this.saveProcessExecution)
            .then(() => {
              this.isVisible = false;
            })
            .catch((error) => {
              this.hasError = true;
              this.errorMessage = error;
            });
        } else if (response.statusCode == 200) {
          this.hasError = true;
          this.errorMessage = 'Analysis name already exists. Please enter another name';
        }
      },
      error: (error) => {
        const errorData: any = error;
        this.loggerService.error(errorData);
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
