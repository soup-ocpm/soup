/**
 * Docker container model class
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 * @deprecated
 */
export class Container {
  // The container id
  public id = '';

  // The container name
  public name = '';

  // The container status
  public status = false;

  // The container image
  public image: any;

  // The container directories
  public directories: string[] = [];
}
