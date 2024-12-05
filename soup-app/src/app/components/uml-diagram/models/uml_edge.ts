/**
 * Uml edge model class
 * @version 1.0
 */
export class UMLEdge {
  public source = '';

  public target = '';

  public multiplicity: { left: string; right: string } = { left: '', right: '' };
}
