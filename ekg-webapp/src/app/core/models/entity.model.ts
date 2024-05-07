/**
 * Entity model class
 * @version 1.0
 */
export class Entity {

  // The Entity name
  public name: string = '';

  // If the Entity was selected or not
  public selected: boolean = false;

  /**
   * Initialize a new instance of Entity
   * @param name the entity name
   * @param selected the entity selection
   */
  constructor(name: string, selected: boolean) {
    this.name = name;
    this.selected = selected;
  }
}
