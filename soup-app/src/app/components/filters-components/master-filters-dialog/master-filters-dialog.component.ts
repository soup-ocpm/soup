import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NgbActiveModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap';

import { MaterialModule } from '../../../shared/modules/materlal.module';

/**
 * Primary Filter Component
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-master-filters-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, NgbTooltip, SpBtnComponent],
  templateUrl: './master-filters-dialog.component.html',
  styleUrl: './master-filters-dialog.component.scss'
})
export class MasterFiltersDialogComponent {
  // All filters
  public filters = ['Timestamp', 'Performance', 'Include Activities', 'Exclude Activities', 'Frequence', 'Variant'];

  /**
   * Constructor for MasterFiltersDialogComponent component
   * @param activeModal the NgbActiveModal
   */
  constructor(public activeModal: NgbActiveModal) {}

  // Close the modal
  public onModalClose(): void {
    this.activeModal.close();
  }

  /**
   * On select filter
   * @param filter the filter
   */
  public onSelectFilter(filter: string): void {
    this.activeModal.close(filter);
  }

  /**
   * Get the filter text info based on the filter
   */
  public getFilterTextInfo(filter: string): string {
    let result = '';

    switch (filter) {
      case 'Timestamp':
        result = 'Narrow down the EKG data by specifying a custom date and time range';
        break;

      case 'Performance':
        result = 'Filter EKG by selecting an entity type and applying duration-based conditions';
        break;

      case 'Include Activities':
        result = 'Filtro: Include Activities';
        break;

      case 'Exclude Activities':
        result = 'Filtro: Exclude';
        break;

      case 'Frequence':
        result = 'Filter EKG traces based on how frequently specific activities occur within a selected entity type';
        break;

      case 'Variant':
        result = 'Filter EKG traces based on the occurrences of variants of a selected entity type';
        break;
    }

    return result;
  }
}
