import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal, NgbDateStruct, NgbModule, NgbTimeStruct } from '@ng-bootstrap/ng-bootstrap';
import { LocalDataService } from 'src/app/shared/services/support.service';
import { TimestampFilter } from './timestamp-filter.model';

@Component({
  selector: 'app-timestam-filter-dialog',
  standalone: true,
  imports: [
    FormsModule,
    NgbModule,
    // Component import
    SpBtnComponent
  ],
  templateUrl: './timestam-filter-dialog.component.html',
  styleUrl: './timestam-filter-dialog.component.scss'
})
export class TimestamFilterDialogComponent implements OnInit {
  // The timestamp model
  public timestampModel: TimestampFilter = new TimestampFilter();

  // The start date model
  public startDateModel: { year: number; month: number; day: number } | undefined;

  // The end date model
  public endDateModel: { year: number; month: number; day: number } | undefined;

  // The min date
  public minDateModel: { year: number; month: number; day: number } | undefined;

  // The max date
  public maxDateModel: { year: number; month: number; day: number } | undefined;

  // Start time model
  public startTimeModel: NgbTimeStruct = { hour: 0, minute: 0, second: 0 };

  // End time model
  public endTimeModel: NgbTimeStruct = { hour: 23, minute: 59, second: 59 };

  /**
   * Constructor for TimestamFilterDialogComponent component
   * @param activeModal the NgbActiveModal modal
   * @param supportService the LocalDataService service
   */
  constructor(
    public activeModal: NgbActiveModal,
    private supportService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    const currentDataset = this.supportService.getCurrentDataset();

    // Set the min and max date for the picker
    if (currentDataset != null && currentDataset.minEventDateTime != null && currentDataset.maxEventDateTime) {
      // Set the minimum
      this.minDateModel = {
        year: currentDataset.minEventDateTime.year,
        month: currentDataset.minEventDateTime.month,
        day: currentDataset.minEventDateTime.day
      };

      this.startTimeModel = {
        hour: currentDataset.minEventDateTime.hour,
        minute: currentDataset.minEventDateTime.minute,
        second: currentDataset.minEventDateTime.second
      };

      // Set maximum
      this.maxDateModel = {
        year: currentDataset.maxEventDateTime.year,
        month: currentDataset.maxEventDateTime.month,
        day: currentDataset.maxEventDateTime.day
      };

      this.endTimeModel = {
        hour: currentDataset.maxEventDateTime.hour,
        minute: currentDataset.maxEventDateTime.minute,
        second: currentDataset.maxEventDateTime.second
      };
    }
  }

  /**
   * Handle date selection from the datepicker.
   * @param field The field to update ('start' or 'end').
   * @param event The selected date event.
   */
  public onDateSelect(field: 'start' | 'end', event: NgbDateStruct): void {
    if (field === 'start') {
      this.startDateModel = event;
    } else {
      this.endDateModel = event;
    }
  }

  /**
   * Submit the data
   */
  public onSubmit(): void {
    if (this.startDateModel && this.endDateModel) {
      const startDateTime = this.combineDateAndTime(this.startDateModel, this.startTimeModel);
      const endDateTime = this.combineDateAndTime(this.endDateModel, this.endTimeModel);

      this.timestampModel.startDate = startDateTime;
      this.timestampModel.endDate = endDateTime;

      this.activeModal.close({ timestamp: this.timestampModel });
    }
  }

  /**
   * Close the modal without returning any data.
   */
  public onClose(): void {
    this.activeModal.dismiss();
  }

  /**
   * Convert the NgbDateStruct to a JavaScript Date object.
   * @param date The NgbDateStruct object.
   */
  private combineDateAndTime(date: NgbDateStruct, time: NgbTimeStruct): Date {
    return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, time.second);
  }
}
