import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Dataset } from 'src/app/models/dataset.model';
import { LocalDataService } from 'src/app/shared/services/support.service';

@Component({
  selector: 'app-performance-filter-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, SpBtnComponent],
  templateUrl: './performance-filter-dialog.component.html',
  styleUrl: './performance-filter-dialog.component.scss'
})
export class PerformanceFilterDialogComponent implements OnInit {
  // Start activity name
  public startActivityModel = '';

  // End activity name
  public endActivityName = '';

  // The seconds
  public seconds = 0;

  // The current dataset
  public currentDataset: Dataset | undefined;

  /**
   * Constructor for TimestamFilterDialogComponent component
   * @param activeModal the NgbActiveModal
   * @param supportService the LocalDataService service
   */
  constructor(
    public activeModal: NgbActiveModal,
    private supportService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.currentDataset = this.supportService.getCurrentDataset();
  }

  /**
   * Submit the data
   */
  public onSubmit(): void {
    if (this.startActivityModel && this.endActivityName && this.seconds > 0) {
      this.activeModal.close({ startActivityName: this.startActivityModel, endActivityName: this.endActivityName, seconds: this.seconds });
    }
  }

  /**
   * Close the modal without returning any data.
   */
  public onClose(): void {
    this.activeModal.dismiss();
  }

  /**
   * Get the current dataset filtered columns
   * @returns
   */
  public getFilteredValuesColumn(): string[] {
    return ['Ciao', 'Cazzo'];
  }
}
