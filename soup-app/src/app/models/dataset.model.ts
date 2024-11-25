import { DatasetProcessInfo } from './dataset_process_info.model';

/**
 * Dataset model class
 * @version 1.0
 */
export class Dataset {
  // The dataset name
  public name = '';

  // The dataset description
  public description = '';

  // The event nodes
  public eventNodes = 0;

  // The entity nodes
  public entityNodes = 0;

  // The CORR relationships
  public corrRel = 0;

  // The DF relationships
  public dfRel = 0;

  // The class nodes
  public classNodes = 0;

  // The OBS relationships
  public obsRel = 0;

  // The DF_C relationships
  public dfcRel = 0;

  // The number of node
  public totalNodes = 0;

  // The number of relationships
  public totalRelationships = 0;

  // The standard and principal csv columns (event, timestamp and activity)
  public standardColumns: string[] = [];

  // The filtered columns
  public filteredColumns: string[] = [];

  // The values columns
  public valuesColumns: string[] = [];

  // All columns
  public allColumns: string[] = [];

  // The process info object
  public processInfo: DatasetProcessInfo = new DatasetProcessInfo();

  // The container id
  public containerId = '';

  // The creation date
  public dateCreated = '';

  // The update date
  public dateModified = '';

  // If the user want to view the full data or not
  public viewInfo = false;

  // The standard graph details for the view
  public standardGraphDetails: any;

  // The class graph details for the view
  public classGraphDetails: any;
}
