import { GraphData } from '../enums/graph_data.enum';

/**
 * Card model class
 * @version 1.0
 */
export class DetailGraphData {
  // The Card title
  public title = '';

  // The Card description
  public type = '';

  // The Card description
  public description = '';

  // The Card json data
  public jsonData: any;

  // The Card data number (number of node or edges)
  public dataNumber = 0;

  // The data type
  public dataType: GraphData = GraphData.EventNodes;
}
