/**
 * Docker container model class
 * @version 1.0
 */
export class Container {

  // The container id
  public id: string = '';

  // The container name
  public name: string = '';

  // The container status
  public status: boolean = false;

  // The container image
  public image: any;

  // The container directories
  public directories: string[] = [];

  /**
   * Initialize a new instance of Container
   * @param id the Container id
   * @param name the Container name
   * @param status the Container status
   * @param image the Container image
   */
  constructor(id: string, name: string, status: boolean, image: string) {
    this.id = id;
    this.name = name;
    this.status = status;
    this.image = image;
    this.directories = [];
  }
}
