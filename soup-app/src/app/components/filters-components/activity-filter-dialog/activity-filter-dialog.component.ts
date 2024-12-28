import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Dataset } from 'src/app/models/dataset.model';
import { Entity } from 'src/app/models/entity.mode';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';
import { LocalDataService } from 'src/app/shared/services/support.service';
import { ActivityFilter } from './activity-filter.model';

@Component({
  selector: 'app-activity-filter-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    // Component import
    SpBtnComponent
  ],
  templateUrl: './activity-filter-dialog.component.html',
  styleUrl: './activity-filter-dialog.component.scss'
})
export class ActivityFilterDialogComponent implements OnInit {
  // The activity model
  public activityModel: ActivityFilter = new ActivityFilter();

  // The input data from external
  public inputData: any;

  // All the .csv file entities
  public allFilteredValues: Entity[] = [];

  // The current dataset
  public currentDataset: Dataset | undefined;

  /**
   * Constructor for ActivityFilterDialogComponent component
   * @param activeModal the NgbActiveModal
   * @param supportDataService the LocalDataService service
   */
  constructor(
    public activeModal: NgbActiveModal,
    private supportDataService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.currentDataset = this.supportDataService!.getCurrentDataset();
    this.currentDataset!.allActivities.forEach((item) => {
      const entity = new Entity();
      entity.name = item;
      entity.selected = false;
      this.allFilteredValues.push(entity);
    });
  }

  /**
   * Submit the selected entity
   * @param entity the selected entity
   * @param event the event (boolean value)
   */
  public submitEntity(entity: Entity, event: any): void {
    entity.selected = event;
    if (entity.selected) {
      this.allFilteredValues.forEach((e: Entity): void => {
        if (e.name == entity.name) {
          e.selected = entity.selected;
        }
      });
    }
  }

  /**
   * Submit the data
   */
  public onSubmit(): void {
    const selectedActivityNames = this.allFilteredValues.filter((entity) => entity.selected).map((entity) => entity.name);

    if (selectedActivityNames.length === 0) {
      return;
    }

    this.activityModel.activities = selectedActivityNames;
    this.activityModel.include = this.inputData;

    this.activeModal.close({ activities: this.activityModel });
  }

  /**
   * Close the modal without returning any data.
   */
  public onClose(): void {
    this.activeModal.dismiss();
  }
}
