import { Injectable } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

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

  // For view the standard graph
  public viewStandardGraph = false;

  // For view the aggregate graph
  public viewClassGraph = false;

  /**
   * Initialize a new instance of SupportService service
   */
  constructor(private sanitizer: DomSanitizer) {}

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
   * Remove the current dataset
   */
  public removeCurrentDataset(): void {
    this.currentDataset = undefined;
  }

  /**
   * Parse the item to Dataset
   * @param item the item
   * @returns a Dataset object
   * ** orrible code depends on the python variables :( **
   */
  public parseItemToDataset(item: any): Dataset | undefined {
    if (item != null) {
      // Standard properties
      const dataset = new Dataset();
      dataset.name = item['dataset_name'];
      dataset.description = item['dataset_description'];
      dataset.eventNodes = item['event_nodes'];
      dataset.entityNodes = item['entity_nodes'];
      dataset.corrRel = item['corr_rel'];

      dataset.dfRel = item['df_rel'];
      dataset.classNodes = item['class_nodes'];
      dataset.obsRel = item['obs_rel'];
      dataset.dfcRel = item['df_c_rel'];

      // Svg content
      if (item['svg_content'] != null) {
        dataset.svg = this.formatSvg(item['svg_content']);
        dataset.svg = this.sanitizer.bypassSecurityTrustHtml(dataset.svg);
      } else {
        dataset.svg = null;
      }

      dataset.totalNodes = dataset.eventNodes + dataset.entityNodes;
      dataset.totalRelationships = dataset.corrRel + dataset.dfRel;

      // Format the date
      dataset.dateCreated = this.formatDateTime(item['date_created'])!;
      dataset.dateModified = this.formatDateTime(item['date_modified'])!;
      dataset.standardColumns = item['standard_columns'];
      dataset.filteredColumns = item['filtered_columns'];
      dataset.valuesColumns = item['values_columns'];
      dataset.allColumns = item['all_columns'];

      // Format the execution process time
      const datasetProcess = new DatasetProcessInfo();
      const processData = item['process_info'];
      datasetProcess.startNormalExecutionTime = this.formatDateTime(processData['init_time']);
      datasetProcess.finishNormalExecutionTime = this.formatDateTime(processData['finish_time']);
      datasetProcess.startEventTimeExecution = this.formatDateTime(processData['init_event_time']);
      datasetProcess.finishEventTimeExecution = this.formatDateTime(processData['finish_event_time']);
      datasetProcess.startEntityTimeExecution = this.formatDateTime(processData['init_entity_time']);
      datasetProcess.finishEnityTimeExecution = this.formatDateTime(processData['finish_entity_time']);
      datasetProcess.startCorrTimeExecution = this.formatDateTime(processData['init_corr_time']);
      datasetProcess.finishCorrTimeExecution = this.formatDateTime(processData['finish_corr_time']);
      datasetProcess.startDfTimeExecution = this.formatDateTime(processData['init_df_time']);
      datasetProcess.finishDfTimeExecution = this.formatDateTime(processData['finish_df_time']);
      datasetProcess.startClassExecutionTime = this.formatDateTime(processData['init_class_time']);
      datasetProcess.finishClassExecutionTime = this.formatDateTime(processData['finish_class_time']);
      datasetProcess.startClassNodeTimeExecution = this.formatDateTime(processData['init_class_node_time']);
      datasetProcess.finishClassNodeTimeExecution = this.formatDateTime(processData['finish_class_node_time']);
      datasetProcess.startObsTimeExecution = this.formatDateTime(processData['init_obs_time']);
      datasetProcess.finishObsTimeExecution = this.formatDateTime(processData['finish_obs_time']);
      datasetProcess.startDfCTimeExecution = this.formatDateTime(processData['init_dfc_time']);
      datasetProcess.finishDfCTimeExecution = this.formatDateTime(processData['finish_dfc_time']);

      // Duration time
      datasetProcess.durationNormalExecution = this.calculateDuration(processData['init_time'], processData['finish_time']);
      datasetProcess.durationClassExecution = this.calculateDuration(processData['init_class_time'], processData['finish_class_time']);
      datasetProcess.durationEventExecution = this.calculateDuration(processData['init_event_time'], processData['finish_event_time']);
      datasetProcess.durationEntityExecution = this.calculateDuration(processData['init_entity_time'], processData['finish_entity_time']);
      datasetProcess.durationCorrExecution = this.calculateDuration(processData['init_corr_time'], processData['finish_corr_time']);
      datasetProcess.durationDfExecution = this.calculateDuration(processData['init_df_time'], processData['finish_df_time']);
      datasetProcess.durationClassNodeExecution = this.calculateDuration(
        processData['init_class_node_time'],
        processData['finish_class_node_time']
      );
      datasetProcess.durationObsExecution = this.calculateDuration(processData['init_obs_time'], processData['finish_obs_time']);
      datasetProcess.durationDfCExecution = this.calculateDuration(processData['init_dfc_time'], processData['finish_dfc_time']);
      dataset.processInfo = datasetProcess;
      return dataset;
    }
    return undefined;
  }

  /**
   * Retrieve the updated dataset class
   */
  public updateDatasetInfo(item: any): Dataset {
    // Standard data
    this.currentDataset!.classNodes = item['class_nodes'];
    this.currentDataset!.obsRel = item['obs_rel_count'];
    this.currentDataset!.dfcRel = item['df_c_rel_count'];

    // Process execution
    const processInfoData = item['process_info'];
    this.currentDataset!.processInfo.startClassExecutionTime = this.formatDateTime(processInfoData['init_class_time']);
    this.currentDataset!.processInfo.finishClassExecutionTime = this.formatDateTime(processInfoData['finish_class_time']);
    this.currentDataset!.processInfo.startClassNodeTimeExecution = this.formatDateTime(processInfoData['init_class_node_time']);
    this.currentDataset!.processInfo.finishClassNodeTimeExecution = this.formatDateTime(processInfoData['finish_class_node_time']);
    this.currentDataset!.processInfo.startObsTimeExecution = this.formatDateTime(processInfoData['init_obs_time']);
    this.currentDataset!.processInfo.finishObsTimeExecution = this.formatDateTime(processInfoData['finish_obs_time']);
    this.currentDataset!.processInfo.startDfCTimeExecution = this.formatDateTime(processInfoData['init_dfc_time']);
    this.currentDataset!.processInfo.finishDfCTimeExecution = this.formatDateTime(processInfoData['finish_dfc_time']);

    // Calculate duration
    this.currentDataset!.processInfo.durationClassExecution = this.calculateDuration(
      processInfoData['init_class_time'],
      processInfoData['finish_class_time']
    );

    this.currentDataset!.processInfo.durationClassNodeExecution = this.calculateDuration(
      processInfoData['init_class_node_time'],
      processInfoData['finish_class_node_time']
    );

    this.currentDataset!.processInfo.durationObsExecution = this.calculateDuration(
      processInfoData['init_obs_time'],
      processInfoData['finish_obs_time']
    );

    this.currentDataset!.processInfo.durationDfCExecution = this.calculateDuration(
      processInfoData['init_dfc_time'],
      processInfoData['finish_dfc_time']
    );

    return this.currentDataset!;
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

  /**
   * Format the date
   * @param isoString the iso string
   * @returns the date
   */
  public formatDateTime(isoString: string | undefined): string | undefined {
    if (!isoString) {
      return undefined;
    }
    const date = new Date(isoString);
    const formattedDate = date.toLocaleDateString('en-US');
    const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${formattedDate} ${formattedTime}`;
  }

  private formatSvg(svgContent: string): string {
    return svgContent
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/  +/g, ' ')
      .trim();
  }
}
