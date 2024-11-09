import { Injectable } from '@angular/core';

import { Dataset } from '../../models/dataset.model';
import { DatasetProcessInfo } from '../../models/dataset_process_info.model';

@Injectable({
  providedIn: 'root'
})
export class LocalDataService {
  // The current dataset
  private currentDataset: Dataset | undefined = undefined;

  // The dataset filtered column
  private datasetFilteredColumn: string[] = [];

  // For view the standard graph or class
  public viewStandardGraph = false;

  /**
   * Initialize a new instance of SupportService service
   */
  constructor() {}

  /**
   * Get the dataset filtered column
   * @returns the dataset filtered column
   */
  public getFilteredColumns(): string[] {
    return this.datasetFilteredColumn;
  }

  /**
   * Set the dataset filtered column
   * @param filteredColumn the filtered column
   */
  public setFilteredColumn(filteredColumn: string[]): void {
    this.datasetFilteredColumn = filteredColumn;
  }

  /**
   * Retrieve the current dataset
   * @returns
   */
  public getCurrentDataset(): Dataset | undefined {
    return this.currentDataset;
  }

  /**
   * Set the current dataset
   * @param dataset the Dataset
   */
  public setCurrentDataset(dataset: Dataset): void {
    this.currentDataset = dataset;
  }

  /**
   * Parse the item to Dataset
   * @param containerId the container id
   * @param item the item
   * @returns a Dataset object
   */
  public parseItemToDataset(containerId: string, item: any): Dataset | undefined {
    if (item != null) {
      const dataset = new Dataset();
      dataset.name = item['dataset_name'];
      dataset.description = item['dataset_description'];
      dataset.containerId = containerId;
      dataset.eventNodes = item['event_nodes'];
      dataset.entityNodes = item['entity_nodes'];
      dataset.corrRel = item['corr_rel'];
      dataset.dfRel = item['df_rel'];
      dataset.classNodes = item['class_nodes'];
      dataset.obsRel = item['obs_rel'];
      dataset.dfcRel = item['df_c_rel'];
      dataset.totalNodes = dataset.eventNodes + dataset.entityNodes + dataset.classNodes;
      dataset.totalRelationships = dataset.corrRel + dataset.dfRel + dataset.obsRel + dataset.dfcRel;
      dataset.dateCreated = item['DateCreated'];
      dataset.dateModified = item['DateModified'];

      const datasetProcess = new DatasetProcessInfo();
      const processData = item['process_info'];

      // Assign the time
      datasetProcess.startNormalExecutionTime = processData['init_time'];
      datasetProcess.finishNormalExecutionTime = processData['finish_time'];

      datasetProcess.startEventTimeExecution = processData['init_event_time'];
      datasetProcess.finishEventTimeExecution = processData['finish_event_time'];

      datasetProcess.startEntityTimeExecution = processData['init_entity_time'];
      datasetProcess.finishEnityTimeExecution = processData['finish_entity_time'];

      datasetProcess.startCorrTimeExecution = processData['init_corr_time'];
      datasetProcess.finishCorrTimeExecution = processData['finish_corr_time'];

      datasetProcess.startDfTimeExecution = processData['init_df_time'];
      datasetProcess.finishDfTimeExecution = processData['finish_df_time'];

      datasetProcess.startClassExecutionTime = processData['init_class_time'];
      datasetProcess.finishClassExecutionTime = processData['finish_class_time'];

      datasetProcess.startClassNodeTimeExecution = processData['init_class_node_time'];
      datasetProcess.finishClassNodeTimeExecution = processData['finish_class_node_time'];

      datasetProcess.startObsTimeExecution = processData['init_obs_time'];
      datasetProcess.finishObsTimeExecution = processData['finish_obs_time'];

      datasetProcess.startDfCTimeExecution = processData['init_dfc_time'];
      datasetProcess.finishDfCTimeExecution = processData['finish_dfc_time'];

      // Process the duration
      datasetProcess.durationNormalExecution = this.calculateDuration(
        datasetProcess.startNormalExecutionTime,
        datasetProcess.finishNormalExecutionTime
      );
      datasetProcess.durationClassExecution = this.calculateDuration(
        datasetProcess.startClassExecutionTime,
        datasetProcess.finishClassExecutionTime
      );
      datasetProcess.durationEventExecution = this.calculateDuration(
        datasetProcess.startEventTimeExecution,
        datasetProcess.finishEventTimeExecution
      );
      datasetProcess.durationEntityExecution = this.calculateDuration(
        datasetProcess.startEntityTimeExecution,
        datasetProcess.finishEnityTimeExecution
      );
      datasetProcess.durationCorrExecution = this.calculateDuration(
        datasetProcess.startCorrTimeExecution,
        datasetProcess.finishCorrTimeExecution
      );
      datasetProcess.durationDfExecution = this.calculateDuration(
        datasetProcess.startDfTimeExecution,
        datasetProcess.finishDfTimeExecution
      );
      datasetProcess.durationClassNodeExecution = this.calculateDuration(
        datasetProcess.startClassNodeTimeExecution,
        datasetProcess.finishClassNodeTimeExecution
      );
      datasetProcess.durationObsExecution = this.calculateDuration(
        datasetProcess.startObsTimeExecution,
        datasetProcess.finishObsTimeExecution
      );
      datasetProcess.durationDfCExecution = this.calculateDuration(
        datasetProcess.startDfCTimeExecution,
        datasetProcess.finishDfCTimeExecution
      );

      dataset.processInfo = datasetProcess;

      return dataset;
    }
    return undefined;
  }

  /**
   * Process the time duration
   * @param start start time
   * @param finish end time
   * @returns the number that represent the duration
   */
  private calculateDuration(start: any, finish: any): number | undefined {
    if (start && finish) {
      const startTime = new Date(start);
      const finishTime = new Date(finish);
      const durationMs = finishTime.getTime() - startTime.getTime();
      return durationMs / 1000;
    }
    return undefined;
  }
}
