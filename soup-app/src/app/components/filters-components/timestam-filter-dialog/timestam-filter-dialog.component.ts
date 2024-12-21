import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';

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
export class TimestamFilterDialogComponent {
  // The start date model
  public startDateModel: { year: number; month: number; day: number } | undefined;

  // The end date model
  public endDateModel: { year: number; month: number; day: number } | undefined;

  /**
   * Constructor for TimestamFilterDialogComponent component
   * @param activeModal the NgbActiveModal
   */
  constructor(public activeModal: NgbActiveModal) {}

  /**
   * Handle date selection from the datepicker.
   * @param field The field to update ('start' or 'end').
   * @param event The selected date event.
   */
  public onDateSelect(field: 'start' | 'end', event: { year: number; month: number; day: number }): void {
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
      const startDate = this.convertToDate(this.startDateModel);
      const endDate = this.convertToDate(this.endDateModel);

      const formattedStartDate = this.formatDate(startDate);
      const formattedEndDate = this.formatDate(endDate);

      this.activeModal.close({ startDate: formattedStartDate, endDate: formattedEndDate });
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
  private convertToDate(date: { year: number; month: number; day: number }): Date {
    return new Date(date.year, date.month - 1, date.day);
  }

  /**
   * Format a date object to a string.
   * @param date The date object.
   * @returns A formatted string.
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}T00:00:00,000`;
  }
}
