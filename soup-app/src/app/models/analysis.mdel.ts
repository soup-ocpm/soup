import { ActivityFilter } from '../components/filters-components/activity-filter-dialog/activity-filter.model';
import { FrequenceFilter } from '../components/filters-components/frequence-filter-dialog/frequence-filter.model';
import { PerformanceFilter } from '../components/filters-components/performance-filter-dialog/performance-filter.model';
import { TimestampFilter } from '../components/filters-components/timestam-filter-dialog/timestamp-filter.model';
import { VariantFilter } from '../components/filters-components/variant-filter-dialog/variant-filter.model';

/**
 * Analysis model class
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
export class Analysis {
  // The analysys dataset name
  public datasetName = '';

  // The analysys name
  public analysisName = '';

  // The analysis description
  public analysisDescription = '';

  // The analysys timestamp filters
  public timestampFilters: TimestampFilter[] = [];

  // The analysis performance filters
  public performanceFilters: PerformanceFilter[] = [];

  // The analysys include activities filters
  public includeActivitiesFilters: ActivityFilter[] = [];

  // The analysys exclude activities filters
  public excludeActivitiesFilters: ActivityFilter[] = [];

  // The analysis frequence filters
  public frequenceFilters: FrequenceFilter[] = [];

  // The analysis variant filters
  public variantFilters: VariantFilter[] = [];

  /**
   * Sum the number of filters
   * @returns the number of filters
   */
  public getTotalFilters(): number {
    return (
      this.timestampFilters.length +
      this.performanceFilters.length +
      this.includeActivitiesFilters.length +
      this.excludeActivitiesFilters.length +
      this.frequenceFilters.length +
      this.variantFilters.length
    );
  }

  /**
   * Get the filter string concat
   * @returns the filters in string format
   */
  public getAnalysisFiltersString(): string {
    const filters = [];

    if (this.timestampFilters.length > 0) filters.push('Timestamp');
    if (this.performanceFilters.length > 0) filters.push('Performance');
    if (this.includeActivitiesFilters.length > 0) filters.push('Include Activity');
    if (this.excludeActivitiesFilters.length > 0) filters.push('Exclude Activity');
    if (this.frequenceFilters.length > 0) filters.push('Frequence');
    if (this.variantFilters.length > 0) filters.push('Variant');

    return filters.join(', ');
  }

  /**
   * Create the analysis paylaoad
   * @returns the payload
   */
  public buildFiltersPayload(): any {
    const payload = {
      timestamp: this.timestampFilters.map((filter: any) => ({
        startDate: filter.startDate,
        endDate: filter.endDate
      })),
      performance: this.performanceFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        seconds: filter.seconds
      })),
      includeActivities: this.includeActivitiesFilters.map((filter: any) => ({
        activities: filter.activities
      })),
      excludeActivities: this.excludeActivitiesFilters.map((filter: any) => ({
        activities: filter.activities
      })),
      frequence: this.frequenceFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        frequency: filter.frequency
      })),
      variant: this.variantFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        variant: filter.variant
      }))
    };

    return payload;
  }

  /**
   * Build the json format by the filters
   * @returns a json format
   */
  public getJSONFormat(): any {
    const payload = {
      timestamp: this.timestampFilters.map((filter: any) => ({
        startDate: filter.startDate,
        endDate: filter.endDate
      })),
      performance: this.performanceFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        seconds: filter.seconds
      })),
      includeActivities: this.includeActivitiesFilters.map((filter: any) => ({
        activities: filter.activities
      })),
      excludeActivities: this.excludeActivitiesFilters.map((filter: any) => ({
        activities: filter.activities
      })),
      frequence: this.frequenceFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        frequency: filter.frequency
      })),
      variant: this.variantFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        variant: filter.variant
      }))
    };

    return payload;
  }
}
