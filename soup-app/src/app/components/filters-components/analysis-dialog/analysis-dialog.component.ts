import { SpBtnTxtComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Analysis } from 'src/app/models/analysis.mdel';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';

import { ActivityFilter } from '../activity-filter-dialog/activity-filter.model';
import { PerformanceFilter } from '../performance-filter-dialog/performance-filter.model';
import { TimestampFilter } from '../timestam-filter-dialog/timestamp-filter.model';

/**
 * Analysis Filter Component
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-analysis-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    // Component import
    SpBtnTxtComponent
  ],
  templateUrl: './analysis-dialog.component.html',
  styleUrl: './analysis-dialog.component.scss'
})
export class AnalysisDialogComponent {
  /**
   * Constructor for AnalysisDialogComponent component
   * @param analysis the Analysis object
   */
  constructor(@Inject(MAT_DIALOG_DATA) public analysis: Analysis) {}

  /**
   * Get the total filter numbers
   * @returns the total filters number
   */
  public getTotalFilter(): number {
    return (
      this.analysis.timestampFilters.length +
      this.analysis.performanceFilters.length +
      this.analysis.includeActivitiesFilters.length +
      this.analysis.excludeActivitiesFilterss.length
    );
  }

  /**
   * Get the filter string concat
   * @returns the filters in string format
   */
  public getActiveFiltersString(): string {
    const filters = [];

    if (this.analysis.timestampFilters.length > 0) filters.push('Timestamp');
    if (this.analysis.performanceFilters.length > 0) filters.push('Performance');
    if (this.analysis.includeActivitiesFilters.length > 0) filters.push('Include Activity');
    if (this.analysis.excludeActivitiesFilterss.length > 0) filters.push('Exclude Activity');

    return filters.join(', ');
  }

  /**
   * Build the json format by the filters
   * @returns a json format
   */
  public getJSONFormat(): any {
    const payload = {
      timestamp: this.analysis.timestampFilters?.map((filter: TimestampFilter) => ({
        startDate: filter.startDate,
        endDate: filter.endDate
      })),
      performance: this.analysis.performanceFilters?.map((filter: PerformanceFilter) => ({
        startActivity: filter.startActivity,
        endActivity: filter.endActivity,
        seconds: filter.seconds
      })),
      includeActivities: this.analysis.includeActivitiesFilters?.map((filter: ActivityFilter) => ({
        activities: filter.activities
      })),
      excludeActivities: this.analysis.excludeActivitiesFilterss?.map((filter: ActivityFilter) => ({
        activities: filter.activities
      }))
    };

    return payload;
  }

  /**
   * Download the json
   */
  public downloadJSON(): void {
    const payload = this.getJSONFormat();
    const jsonString = JSON.stringify(payload, null, 2);

    // Create the blob
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);

    // Create the link
    const link = document.createElement('a');
    link.href = url;
    link.download = this.analysis.analysisName + '.json';

    link.click();
    window.URL.revokeObjectURL(url);
  }
}
