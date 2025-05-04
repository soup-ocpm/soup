/**
 * JSON object structure model class
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
export class JsonObject {
  // Name
  name = '';

  // If the object is selected
  isSelected = false;

  /**
   * Initialize a new instance of JsonObject model
   * @param name the name
   * @param isSelected if it is selected
   */
  constructor(name: string, isSelected: boolean) {
    this.name = name;
    this.isSelected = isSelected;
  }
}
