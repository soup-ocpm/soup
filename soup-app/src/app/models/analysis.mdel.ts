import { ActivityFilter } from '../components/filters-components/activity-filter-dialog/activity-filter.model';
import { PerformanceFilter } from '../components/filters-components/performance-filter-dialog/performance-filter.model';
import { TimestampFilter } from '../components/filters-components/timestam-filter-dialog/timestamp-filter.model';

/**
 * Analysis model class
 * @version 2.0
 */
export class Analysis {
  // The analysys name
  public analysisName = '';

  // The analysys dataset name
  public datasetName = '';

  // The analysys timestamp filters
  public timestampFilters: TimestampFilter[] = [];

  // The analysis performance filters
  public performanceFilters: PerformanceFilter[] = [];

  // The analysys include activities filters
  public includeActivitiesFilters: ActivityFilter[] = [];

  // The analysys exclude activities filters
  public excludeActivitiesFilterss: ActivityFilter[] = [];

  /**
   * Sum the number of filters
   * @returns the number of filters
   */
  public getTotalFilters(): number {
    return (
      this.timestampFilters.length +
      this.performanceFilters.length +
      this.includeActivitiesFilters.length +
      this.excludeActivitiesFilterss.length
    );
  }
}
