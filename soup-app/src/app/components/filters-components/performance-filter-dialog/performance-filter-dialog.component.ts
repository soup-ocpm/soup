import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Dataset } from 'src/app/models/dataset.model';
import { Entity } from 'src/app/models/entity.mode';
import { LocalDataService } from 'src/app/shared/services/support.service';
import { PerformanceFilter } from './performance-filter.model';

@Component({
  selector: 'app-performance-filter-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, SpBtnComponent],
  templateUrl: './performance-filter-dialog.component.html',
  styleUrl: './performance-filter-dialog.component.scss'
})
export class PerformanceFilterDialogComponent implements OnInit {
  // The performance model
  public performanceModel: PerformanceFilter = new PerformanceFilter();

  // Start activity name
  public startActivityModel = '';

  // End activity name
  public endActivityName = '';

  // The seconds
  public seconds = 0;

  // All different activities for this Dataset
  public allDatasetActivities: Entity[] = [];

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
    this.currentDataset!.allActivities.forEach((item) => {
      const entity = new Entity();
      entity.name = item;
      entity.selected = false;
      this.allDatasetActivities.push(entity);
    });
  }

  /**
   * Submit the data
   */
  public onSubmit(): void {
    if (this.startActivityModel && this.endActivityName && this.seconds > 0) {
      this.performanceModel.startActivity = this.startActivityModel;
      this.performanceModel.endActivity = this.endActivityName;
      this.performanceModel.seconds = this.seconds;

      this.activeModal.close({ performance: this.performanceModel });
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
    return this.allDatasetActivities.map((activity) => activity.name);
  }
}
