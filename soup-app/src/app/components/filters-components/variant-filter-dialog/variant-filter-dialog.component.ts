import { SpBtnComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { AfterViewInit, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ApiResponse } from 'src/app/core/models/api_response.model';
import { LoggerService } from 'src/app/core/services/logger.service';
import { AnalysisService } from 'src/app/services/analysis.service';
import { StandardGraphService } from 'src/app/services/standard_graph.service';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';
import { ToastLevel } from 'src/app/shared/components/s-toast/toast_type.enum';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';

import { VariantFilter } from './variant-filter.model';

@Component({
  selector: 'app-variant-filter-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    // Component import
    SpBtnComponent,
    SpSpinnerComponent
  ],
  templateUrl: './variant-filter-dialog.component.html',
  styleUrl: './variant-filter-dialog.component.scss'
})
export class VariantFilterDialogComponent implements AfterViewInit {
  // The variant model
  public variantModel: VariantFilter = new VariantFilter();

  // All graph entity
  public allEntities: string[] = [];

  // Available operators
  public allOperators = ['<', '<=', '=', '!=', '>', '>='];

  // All activity frequencies
  public entityVariations: { variant: string[]; occurrences: number }[] = [];

  // The selected entity type
  public selectedEntityType = '';

  // The selected operator
  public selectedOperator = '';

  // The variation
  public selectedVariation = 0;

  // The error message for entity
  public entityErrorMessage = '';

  // Ngb tooltip
  public tooltip: any;

  // Loading status for entities
  public isLoadingEntities = false;

  // Loading status for variations
  public isLoadingVariation = false;

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

  // NgAfterViewInit implementation
  public ngAfterViewInit() {
    const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach((el) => {
      new this.tooltip.Tooltip(el, {
        html: true
      });
    });
  }

  /**
   * Change the selected entity type
   */
  public changeSelectedEntityType(event: any): void {
    this.selectedEntityType = event;

    // Contact the server for retrieve the avg duration
    this.isLoadingVariation = true;
    this.entityVariations = [];
    this.entityErrorMessage = '';
    setTimeout(() => {
      this.retrieveEntityVariations();
    }, 300);
  }

  /**
   * Retrieve all entity variations
   */
  private retrieveEntityVariations(): void {
    this.analysisService.retrieveEntityVariationOccurrences(this.selectedEntityType).subscribe({
      next: (response) => {
        if (response != null && response.statusCode === 200 && response.responseData != null) {
          const data = response.responseData;

          data.forEach((item: any) => {
            const variant = item.variant;
            const occurrences = item.occurrences;

            this.entityVariations.push({
              variant: variant,
              occurrences: occurrences
            });
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

        this.isLoadingVariation = false;
      },
      error: (errorData: ApiResponse<any>) => {
        // Error
        this.logger.error(
          'Unable to load the activities frequency. Status code: ',
          errorData.statusCode + ' Message: ' + errorData.message
        );

        this.entityErrorMessage = 'Unable to load the activities frequency. Please retry';
        this.toast.show('Unable to load the activities frequency. Please retry', ToastLevel.Error, 3000);

        this.isLoadingVariation = false;
      }
    });
  }

  /**
   * Get specific tooltip text
   */
  public getTooltipText(variant: string[]): string {
    return variant.join('\n');
  }

  /**
   * Submit the data
   */
  public onSubmit(): void {
    if (this.selectedOperator !== '' && this.selectedVariation > 0) {
      this.variantModel.entity = this.selectedEntityType;
      this.variantModel.operator = this.selectedOperator;
      this.variantModel.variant = this.selectedVariation;
      this.activeModal.close({ variant: this.variantModel });
    }
  }

  /**
   * Close the modal without returning any data.
   */
  public onClose(): void {
    this.activeModal.dismiss('close-and-return');
  }
}
