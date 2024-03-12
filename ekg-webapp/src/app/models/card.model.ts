/**
 * Card model class
 * @version 1.0
 */
export class Card {

  // The Card title
  title: string = '';

  // The Card description
  type: string = '';

  // The Card description
  description: string = '';

  // The Card json data
  jsonData: any;

  // The Card data number (number of node or edges)
  dataNumber: number = 0;

  /**
   * Initialize a new instance of Card
   * @param title the card title
   * @param type the card type
   * @param description the card description
   * @param jsonData the JSON data
   * @param dataNumber the number of data
   */
  constructor(title: string, type: string, description: string, jsonData: any, dataNumber: number) {
    this.title = title;
    this.type = type;
    this.description = description;
    this.jsonData = jsonData;
    this.dataNumber = dataNumber;
  }
}
