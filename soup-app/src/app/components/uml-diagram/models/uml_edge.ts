import { UMLMultiplicity } from './uml_multiplicity';

/**
 * Uml edge model
 * @version 1.0
 */
export class UMLEdge {
  // The node source
  public source = '';

  // The node target
  public target = '';

  // The multiplicity
  public multiplicity: UMLMultiplicity = new UMLMultiplicity();
}
