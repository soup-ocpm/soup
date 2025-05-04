/**
 * Entity list model class
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
export class EntityObjectList {
  // Name
  name = '';

  // Number of NaN nodes
  numberOfNanNodes = 0;

  // Is selected or not
  isSelected = false;

  /**
   * Initialize a new instance of EntityObjectList model
   * @param name the name
   * @param numberOfNanNodes number of NaN nodes
   */
  constructor(name: string, numberOfNanNodes: number) {
    this.name = name;
    this.numberOfNanNodes = numberOfNanNodes;
  }
}
