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

import { PerformanceFilter } from './performance-filter.model';

/**
 * Performance Filter Component
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-performance-filter-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    // Component import
    SpBtnComponent,
    SpSpinnerComponent
  ],
  templateUrl: './performance-filter-dialog.component.html',
  styleUrl: './performance-filter-dialog.component.scss'
})
export class PerformanceFilterDialogComponent {
  // The performance model
  public performanceModel: PerformanceFilter = new PerformanceFilter();

  // All graph entity
  public allEntities: string[] = [];

  // Available operators
  public allOperators = ['<', '<=', '=', '!=', '>', '>='];

  // The selected entity type
  public selectedEntityType = '';

  // The entity avg duration
  public avgEntityDuration = null;

  // The selected operator
  public selectedOperator = '';

  // The seconds
  public selectedSeconds = 0;

  // The error message for entity
  public entityErrorMessage = '';

  // Loading status for entities
  public isLoadingEntities = false;

  // Loading status for duration
  public isLoadingDuration = false;

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
    this.isLoadingDuration = true;
    this.avgEntityDuration = null;
    this.entityErrorMessage = '';
    setTimeout(() => {
      this.retrieveEntityAVGDuration();
    }, 300);
  }

  /**
   * Retrieve the entity type avg duration
   */
  private retrieveEntityAVGDuration(): void {
    this.analysisService.retrieveEntityAVGDuration(this.selectedEntityType).subscribe({
      next: (response) => {
        if (response != null && response.statusCode === 200 && response.responseData != null) {
          const data = response.responseData;
          this.avgEntityDuration = data.formatted;
        } else if (response != null && response.statusCode === 202) {
          // No content
          this.logger.error('No entity avg duration found.', response.message);
          this.entityErrorMessage = 'No entity avg duration found. Please retry';
        } else {
          // Error
          this.logger.error('Unable to load the entity avg duration', response.message);
          this.entityErrorMessage = 'Unable to load the entity avg duration. Please retry';
          this.toast.show('Unable to load the entity avg duration. Please retry', ToastLevel.Error, 3000);
        }

        this.isLoadingDuration = false;
      },
      error: (errorData: ApiResponse<any>) => {
        // Error
        this.logger.error(
          'Unable to load the entities avg duration. Status code: ',
          errorData.statusCode + ' Message: ' + errorData.message
        );

        this.entityErrorMessage = 'Unable to load the entities avg duration. Please retry';
        this.toast.show('Unable to load the entities avg duration. Please retry', ToastLevel.Error, 3000);

        this.isLoadingDuration = false;
      }
    });
  }

  /**
   * Submit the data
   */
  public onSubmit(): void {
    if (this.selectedOperator !== '' && this.selectedSeconds > 0) {
      this.performanceModel.entity = this.selectedEntityType;
      this.performanceModel.operator = this.selectedOperator;
      this.performanceModel.seconds = this.selectedSeconds;
      this.activeModal.close({ performance: this.performanceModel });
    }
  }

  /**
   * Close the modal without returning any data.
   */
  public onClose(): void {
    this.activeModal.dismiss('close-and-return');
  }
}
