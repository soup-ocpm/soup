import { DataGraphEnum } from '../enums/data_enum';
/**
 * Card model class
 * @version 1.0
 */
export class Card {

  // The Card title
  public title: string = '';

  // The Card description
  public type: string = '';

  // The Card description
  public description: string = '';

  // The Card json data
  public jsonData: any;

  // The Card data number (number of node or edges)
  public dataNumber: number = 0;

  // The data type
  public dataType: DataGraphEnum = DataGraphEnum.EventNodes;

  /**
   * Initialize a new instance of Card
   * @param title the card title
   * @param type the card type
   * @param description the card description
   * @param jsonData the JSON data
   * @param dataNumber the number of data
   */
  constructor(title: string, type: string, description: string, jsonData: any, dataNumber: number, dataType: DataGraphEnum) {
    this.title = title;
    this.type = type;
    this.description = description;
    this.jsonData = jsonData;
    this.dataNumber = dataNumber;
    this.dataType = dataType;
  }
}
