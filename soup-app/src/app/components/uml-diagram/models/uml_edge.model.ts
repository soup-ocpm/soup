import { UMLMultiplicity } from './uml_multiplicity.model';

/**
 * Uml edge model
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
export class UMLEdge {
  // The node source
  public source = '';

  // The node target
  public target = '';

  // The multiplicity
  public multiplicity: UMLMultiplicity = new UMLMultiplicity();
}
