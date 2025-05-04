import { SpBtnTxtComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { MaterialModule } from '../../../shared/modules/materlal.module';

/**
 * Primary Filter Component
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-primary-filter-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, SpBtnTxtComponent],
  templateUrl: './primary-filter-dialog.component.html',
  styleUrl: './primary-filter-dialog.component.scss'
})
export class PrimaryFilterDialogComponent {
  // All filters
  public filters = ['Timestamp', 'Performance', 'Include Activities', 'Exclude Activities', 'Frequence', 'Variation'];

  /**
   * Constructor for PrimaryFilterDialogComponent component
   * @param activeModal the NgbActiveModal
   */
  constructor(public activeModal: NgbActiveModal) {}

  // Close the modal
  public onModalClose() {
    this.activeModal.close();
  }

  /**
   * On select filter
   * @param filter the filter
   */
  public onSelectFilter(filter: string) {
    this.activeModal.close(filter);
  }
}
