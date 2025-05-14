import { SpBtnComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ApiResponse } from 'src/app/core/models/api_response.model';
import { LoggerService } from 'src/app/core/services/logger.service';
import { AnalysisService } from 'src/app/services/analysis.service';
import { StandardGraphService } from 'src/app/services/standard_graph.service';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';
import { ToastLevel } from 'src/app/shared/components/s-toast/toast_type.enum';

import { FrequenceFilter } from './frequence-filter.model';

@Component({
  selector: 'app-frequence-filter-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    // Component import
    SpBtnComponent,
    SpSpinnerComponent
  ],
  templateUrl: './frequence-filter-dialog.component.html',
  styleUrl: './frequence-filter-dialog.component.scss'
})
export class FrequenceFilterDialogComponent {
  public frequenceModel: FrequenceFilter = new FrequenceFilter();

  // All graph entity
  public allEntities: string[] = [];

  // Available operators
  public allOperators = ['<', '<=', '=', '!=', '>', '>='];

  // All activity frequencies
  public activityFrequencies: { activity: string; occurrences: number }[] = [];

  // The selected entity type
  public selectedEntityType = '';

  // The selected operator
  public selectedOperator = '';

  // The seconds
  public selectedFrequency = 0;

  // The error message for entity
  public entityErrorMessage = '';

  // Loading status for entities
  public isLoadingEntities = false;

  // Loading status for frequencies
  public isLoadingFrequencies = false;

  /**
   * Constructor for TimestamFilterDialogComponent component
   * @param logger the LoggerService service
   * @param activeModal the NgbActiveModal
   * @param supportService the LocalDataService service
   * @param toast the NotificationService service
   * @param analysisService the AnalysisService service
   * @param graphService the StandardGraphService servive
   */
  constructor(
    private logger: LoggerService,
    public activeModal: NgbActiveModal,
    private toast: NotificationService,
    private analysisService: AnalysisService,
    public graphService: StandardGraphService
  ) {}

  /**
   * Change the selected entity type
   */
  public changeSelectedEntityType(event: any): void {
    this.selectedEntityType = event;

    // Contact the server for retrieve the avg duration
    this.isLoadingFrequencies = true;
    this.activityFrequencies = [];
    this.entityErrorMessage = '';
    setTimeout(() => {
      this.retrieveActivityOccurrences();
    }, 300);
  }

  /**
   * Retrieve the entity type avg duration
   */
  private retrieveActivityOccurrences(): void {
    this.analysisService.retrieveEntityOccurrences(this.selectedEntityType).subscribe({
      next: (response) => {
        if (response != null && response.statusCode === 200 && response.responseData != null) {
          const data = response.responseData;

          data.forEach((item: any) => {
            const activity = item.activity;
            const occurrences = item.occurrences;
            this.activityFrequencies.push({ activity: activity, occurrences: occurrences });
          });
        } else if (response != null && response.statusCode === 202) {
          // No content
          this.logger.error('No activities frequency.', response.message);
          this.entityErrorMessage = 'No activities frequency. Please retry';
        } else {
          // Error
          this.logger.error('Unable to load the activities frequency', response.message);
          this.entityErrorMessage = 'Unable to load the activities frequency. Please retry';
          this.toast.show('Unable to load the activities frequency. Please retry', ToastLevel.Error, 3000);
        }

        this.isLoadingFrequencies = false;
      },
      error: (errorData: ApiResponse<any>) => {
        // Error
        this.logger.error(
          'Unable to load the activities frequency. Status code: ',
          errorData.statusCode + ' Message: ' + errorData.message
        );

        this.entityErrorMessage = 'Unable to load the activities frequency. Please retry';
        this.toast.show('Unable to load the activities frequency. Please retry', ToastLevel.Error, 3000);

        this.isLoadingFrequencies = false;
      }
    });
  }

  /**
   * Submit the data
   */
  public onSubmit(): void {
    if (this.selectedOperator != '' && this.selectedFrequency > 0) {
      this.frequenceModel.entity = this.selectedEntityType;
      this.frequenceModel.operator = this.selectedOperator;
      this.frequenceModel.frequency = this.selectedFrequency;
      this.activeModal.close({ frequence: this.frequenceModel });
    }
  }

  /**
   * Close the modal without returning any data.
   */
  public onClose(): void {
    this.activeModal.dismiss('close-and-return');
  }
}
