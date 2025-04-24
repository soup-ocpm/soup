/**
 * Variation filter model class
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
export class VariationFilter {
  // List of the activities
  public activities: string[] = [];

  // List of the distinct activities
  public distinctActivities: string[] = [];

  // The frequency
  public frequency = 0;

  // The avg duration
  public avgDuration = 0;
}
