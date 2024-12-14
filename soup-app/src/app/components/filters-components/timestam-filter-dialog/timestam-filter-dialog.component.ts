import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-timestam-filter-dialog',
  standalone: true,
  imports: [FormsModule, NgbModule],
  templateUrl: './timestam-filter-dialog.component.html',
  styleUrl: './timestam-filter-dialog.component.scss'
})
export class TimestamFilterDialogComponent {
  startDateModel: { year: number; month: number; day: number } | undefined;
  endDateModel: { year: number; month: number; day: number } | undefined;

  constructor(public activeModal: NgbActiveModal) {}

  // Close the modal without returning any data
  onClose(): void {
    this.activeModal.dismiss();
  }

  // Return the selected date range when the user submits the form
  onSubmit(): void {
    if (this.startDateModel && this.endDateModel) {
      const startDate = new Date(this.startDateModel.year, this.startDateModel.month - 1, this.startDateModel.day);
      const endDate = new Date(this.endDateModel.year, this.endDateModel.month - 1, this.endDateModel.day);

      this.activeModal.close({ startDate, endDate });
    }
  }
}
