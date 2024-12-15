import { SpBtnComponent, SpDividerComponent, SpProgressbarComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import saveAs from 'file-saver';
import { concatMap, from, map, Observable, toArray } from 'rxjs';

import { ModalService } from 'src/app/shared/components/s-modals/modal.service';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';
import { ApiResponse } from '../../core/models/api_response.model';
import { LoggerService } from '../../core/services/logger.service';
import { GraphDataEnum } from '../../enums/graph_data.enum';
import { Dataset } from '../../models/dataset.model';
import { DetailGraphData } from '../../models/detail_graph_data.model';
import { ClassGraphService } from '../../services/class_graph.service';
import { DatasetService } from '../../services/datasets.service';
import { JSONDataService } from '../../services/json_data.service';
import { StandardGraphService } from '../../services/standard_graph.service';
import { ToastLevel } from '../../shared/components/s-toast/toast_type.enum';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

// The entity object for the list
class EntityObject {
  // Name
  name = '';

  // Number of NaN nodes
  numberOfNanNodes = 0;

  // Is selected or not
  isSelected = false;

  /**
   * Initialize a new instance of EntityObject model
   * @param name the name
   * @param numberOfNanNodes number of NaN nodes
   */
  constructor(name: string, numberOfNanNodes: number) {
    this.name = name;
    this.numberOfNanNodes = numberOfNanNodes;
  }
}

// Json object structure
export class JsonObject {
  // Name
  name = '';

  // If the object is selected
  isSelected = false;

  /**
   * Initialize a new instance of JsonObject model
   * @param name the name
   * @param isSelected if it is selected
   */
  constructor(name: string, isSelected: boolean) {
    this.name = name;
    this.isSelected = isSelected;
  }
}

@Component({
  selector: 'app-details-dataset',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    // Component import
    SpBtnComponent,
    SpDividerComponent,
    SpProgressbarComponent,
    SpSpinnerComponent
  ],
  templateUrl: './details-dataset.component.html',
  styleUrl: './details-dataset.component.scss'
})
export class DetailsDatasetComponent implements OnInit, AfterViewInit {
  // The dataset name
  public currentDataset: Dataset | undefined;

  // The detail graph
  public detailGraphDataList: DetailGraphData[] = [];

  // The entity list
  public entityList: EntityObject[] = [];

  // List of selected entities
  public selectedEntities: string[] = [];

  // The json object list
  public jsonList: JsonObject[] = [];

  // List of the selected json content
  public selectedJson: string[] = [];

  // Data pie chart for standard graph
  private dataPieChartInstance: any;

  // Process pie chart for standard graph
  private processPieChartInstance: any;

  // Aggregate data pie chart for class graph
  private aggregateDataPieChartInstance: any;

  // Aggregate process pie chart for class graph
  private aggregateProcessPieChartInstance: any;

  // If the sidebar is open or not
  public isOpenSidebar = true;

  // If the sidebar for aggregation is open or not
  public isOpenAggregationSidebar = false;

  // If the sidebar of JSON is open or not
  public isOpenJSONSidebar = false;

  // If the sidebar for graph visualization is open or not
  public isOpenGraphViewSidebar = false;

  // If the sidebar for filters is open or not
  public isOpenFiltersSidebar = false;

  // If the progress bar is show or not
  public isLoading = false;

  // If the user attend download the json
  public isLoadingJsonDownload = false;

  // Pie chart for dataset data
  @ViewChild('dataPieChart', { static: false }) dataPieChart: ElementRef | undefined;

  // Pie chart for process execution
  @ViewChild('processPieChart', { static: false }) processPieChart: ElementRef | undefined;

  // Pie chart for dataset data
  @ViewChild('aggregateDataPieChart', { static: false }) aggregateDataPieChart: ElementRef | undefined;

  // Pie chart for process execution
  @ViewChild('aggregateProcessPieChart', { static: false }) aggregateProcessPieChart: ElementRef | undefined;

  /**
   * Constructor for DetailsDatasetComponent component
   * @param router the Router
   * @param toast the NotificationService service
   * @param modalService the ModalService service
   * @param activatedRoute the ActivatedRoute
   * @param supportService the LocalDataService service
   * @param datasetService the DatasetService service
   * @param logService the LoggerService service
   * @param jsonDataService the JSONDataService service
   * @param classGraphService the ClassGraphService service
   * @param standardGraphService the StandardGraphService service
   */
  constructor(
    private router: Router,
    private toast: NotificationService,
    private modalService: ModalService,
    private activatedRoute: ActivatedRoute,
    private supportService: LocalDataService,
    private datasetService: DatasetService,
    private logService: LoggerService,
    private jsonDataService: JSONDataService,
    private classGraphService: ClassGraphService,
    private standardGraphService: StandardGraphService
  ) {
    Chart.register(...registerables);
  }

  // NgOnInit implementation
  public ngOnInit(): void {
    const datasetName = this.activatedRoute.snapshot.paramMap.get('name');
    this.currentDataset = this.supportService.getCurrentDataset();

    if (this.currentDataset != null && this.currentDataset.name == datasetName) {
      this.loadDatasetDetails();
      this.retrieveEntityKey();
      this.populateJsonContent();
      this.createDataPieChart();
      this.createProcessPieChart();
    } else {
      this.toast.show('Unable to retrieve Dataset. Retry', ToastLevel.Error, 3000);
      this.router.navigate(['/welcome']);
      return;
    }
  }

  // NgAfterViewInit implementation
  public ngAfterViewInit(): void {
    this.createCharts();
  }

  /**
   * View the complete graph
   * @param standardGraph if we want to view the standard EKG
   * or aggregate EKG
   */
  public goToGraphVisualization(standardGraph: boolean): void {
    if (standardGraph) {
      this.supportService.viewStandardGraph = true;
      this.supportService.viewClassGraph = false;
    } else {
      this.supportService.viewStandardGraph = false;
      this.supportService.viewClassGraph = true;
    }
    this.router.navigate(['datasets', this.currentDataset!.name, 'graph']);
  }

  /**
   * Delete the previous class graph
   */
  public deletePreviousClassGraph(): void {
    this.classGraphService.deleteGraph().subscribe({
      next: (responseData) => {
        if (responseData.statusCode == 200 && responseData.responseData != null) {
          this.buildClassGraph();
        } else {
          this.toast.show('Unable to create the aggregate graph. Check the info and retry.', ToastLevel.Error, 3000);
        }
      },
      error: (errorData) => {
        this.logService.error(errorData);
        this.toast.show('Unable to create the aggregate graph. Check the info and retry.', ToastLevel.Error, 3000);
      },
      complete: () => {}
    });
  }

  /**
   * Build the aggregate EKG
   */
  public buildClassGraph(): void {
    this.isLoading = true;
    this.isOpenAggregationSidebar = false;
    this.isOpenSidebar = false;

    const formData: FormData = new FormData();
    formData.append('dataset_name', this.currentDataset!.name);

    try {
      this.classGraphService.createClassGraph(formData, this.selectedEntities, this.currentDataset!.name).subscribe({
        next: (response) => {
          if (response.statusCode === 201 && response.responseData != null) {
            this.currentDataset = this.supportService.updateDatasetInfo(response.responseData);
            this.isLoading = false;
            this.isOpenSidebar = true;
            this.isOpenAggregationSidebar = false;
            this.resetSelection();

            setTimeout(() => {
              this.createCharts();
            }, 300);
          } else {
            this.isOpenAggregationSidebar = true;
            this.isOpenSidebar = true;
            this.isLoading = false;
            this.toast.show('Error while creating Class Graph. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData) => {
          const apiResponse: any = errorData;
          this.logService.error(apiResponse);
          this.isOpenAggregationSidebar = true;
          this.isOpenSidebar = true;
          this.isLoading = false;
          this.toast.show('Error while creating Class Graph. Retry', ToastLevel.Error, 3000);
        },
        complete: () => {}
      });
    } catch (error) {
      this.toast.show(`Internal Server Error: ${error}`, ToastLevel.Error, 3000);
    }
  }

  /**
   * Handle the click for delete EKG
   */
  public handleDeleteGraph(): void {
    if (this.isOpenAggregationSidebar) {
      return;
    }
    this.modalService.showGenericModal(
      'Delete Dataset?',
      'The Dataset will be completely removed.',
      true,
      'Delete',
      '#FF0000',
      'Cancel',
      '#000000',
      () => this.deleteDataset(),
      () => {
        this.modalService.hideGenericModal();
      }
    );
  }

  /**
   * Delete the Dataset (and EKG)
   */
  public deleteDataset(): void {
    if (this.currentDataset != null) {
      this.datasetService.deleteDataset(this.currentDataset!.name).subscribe({
        next: (response) => {
          if (response.statusCode == 200) {
            this.toast.show('Dataset deleted successfully', ToastLevel.Success, 3000);
            this.supportService.removeCurrentDataset();
            this.router.navigate(['/welcome']);
          }
        },
        error: (error) => {
          const apiResponse: any = error;
          this.logService.error(apiResponse);
          this.toast.show('Unable to delete the Dataset. Please retry', ToastLevel.Error, 3000);
        },
        complete: () => {}
      });
    }
  }

  /**
   * Return to the Manage Dataset page
   */
  public manageDatasets(): void {
    this.supportService.removeCurrentDataset();
    this.router.navigate(['/datasets']);
  }

  /**
   * Get the entity tooltip label
   * @param entity the entity
   * @returns the label
   */
  public getEntityWarningLabel(entity: any) {
    return `${entity.numberOfNanNodes} nodes have NaN value.`;
  }

  /**
   * Method that allow to get the toggle entities for
   * build the Class Graph.
   * @param entity the selected entity
   */
  public selectionEntity(entity: any): void {
    if (entity.isSelected) {
      this.selectedEntities.push(entity.name);
    } else {
      this.selectedEntities = this.selectedEntities.filter((item) => item !== entity.name);
    }
  }

  /**
   * Reset the entity choice
   */
  public resetSelection(): void {
    this.selectedEntities = [];

    this.entityList.forEach((entity) => {
      entity.isSelected = false;
    });
  }

  /**
   * Method that allow to get the toggle json object for
   * donwload the json content.
   * @param entity the selected entity
   */
  public selectionJson(entity: any): void {
    if (entity.isSelected) {
      this.selectedJson.push(entity.name);
    } else {
      this.selectedJson = this.selectedJson.filter((item) => item !== entity.name);
    }
  }

  /**
   * Reset the entity choice
   */
  public resetJsonSelection(): void {
    this.selectedJson = [];

    this.jsonList.forEach((object) => {
      object.isSelected = false;
    });
  }

  /**
   * Download JSON content
   */
  public downloadJsonSelected(): void {
    const requests: { name: string; observable: Observable<ApiResponse<any>> }[] = [];

    this.isLoadingJsonDownload = true;

    this.selectedJson.forEach((selection) => {
      switch (selection) {
        case 'Event nodes':
          requests.push({ name: 'Event nodes', observable: this.jsonDataService.eventNodeJSON() });
          break;
        case 'Entity nodes':
          requests.push({ name: 'Entity nodes', observable: this.jsonDataService.entityNodeJSON() });
          break;
        case ':CORR links':
          requests.push({ name: ':CORR links', observable: this.jsonDataService.corrLinkJSON() });
          break;
        case ':DF links':
          requests.push({ name: ':DF links', observable: this.jsonDataService.dfLinkJSON() });
          break;
      }
    });

    if (requests.length === 0) {
      return;
    }

    from(requests)
      .pipe(
        concatMap((request) => request.observable.pipe(map((response) => ({ name: request.name, data: response.responseData })))),
        toArray()
      )
      .subscribe({
        next: (results) => {
          results.forEach((result) => {
            const filename = `${result.name}-data.json`;
            const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
            saveAs(blob, filename);
          });

          this.isLoadingJsonDownload = false;
          this.isOpenJSONSidebar = false;
          this.resetJsonSelection();
          this.toast.show('Json files downloaded successfully', ToastLevel.Success, 3000);
        },
        error: (err) => {
          console.error('Error during download:', err);
        }
      });
  }

  /**
   * Open or close graph visualization sidebar
   * when the class graph was created
   */
  public handleGraphViewSidebar(): void {
    this.isOpenGraphViewSidebar = !this.isOpenGraphViewSidebar;
  }

  /**
   * Open or close the aggregation sidebar
   */
  public handleAggregationSidebar(): void {
    this.isOpenAggregationSidebar = !this.isOpenAggregationSidebar;
  }

  /**
   * Open or close the JSON sidebar
   */
  public handleJSONSidebar(): void {
    this.isOpenJSONSidebar = !this.isOpenJSONSidebar;
  }

  /**
   * Retrieve entities from the Dataset
   */
  private retrieveEntityKey(): void {
    this.standardGraphService.getEntityKey().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;
          data.forEach((item: any) => {
            this.entityList.push(new EntityObject(item, 0));
          });

          this.retrieveNaNEntity();
        } else {
          this.toast.show('Unable to load the entities key of the Dataset', ToastLevel.Error, 3000);
        }
      },
      error: (errorData) => {
        const apiResponse: any = errorData;
        this.logService.error(apiResponse);
        this.toast.show('Unable to load the entities key of the Dataset', ToastLevel.Error, 3000);
      },
      complete: () => {}
    });
  }

  /**
   * Retrieve NaN entity from the Dataset
   */
  private retrieveNaNEntity(): void {
    const nullEntities: string[] = [];

    this.standardGraphService.getNullEntities().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;

          data.forEach((item: any) => {
            nullEntities.push(item);
          });

          this.entityList.forEach((entity: EntityObject) => {
            nullEntities.forEach((item: any) => {
              if (item.property_name == entity.name) {
                entity.numberOfNanNodes = item.count_nodes;
              }
            });
          });
        } else {
          this.toast.show('Unable to load the entities key of the Dataset', ToastLevel.Error, 3000);
        }
      },
      error: (errorData) => {
        const apiResponse: any = errorData;
        this.logService.error(apiResponse);
        this.toast.show('Unable to load the entities key of the Dataset', ToastLevel.Error, 3000);
      },
      complete: () => {}
    });
  }

  /**
   * Create all charts
   */
  private createCharts(): void {
    if (this.currentDataset) {
      this.createDataPieChart();
      this.createProcessPieChart();

      if (this.currentDataset.classNodes > 0) {
        this.createAggregateDataPieChart();
        this.createAggregateProcessPieChart();
      }
    }
  }

  /**
   * Build the pie chart for dataset data
   */
  private createDataPieChart(): void {
    if (!this.dataPieChart) return;

    const ctx = (this.dataPieChart?.nativeElement as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      this.destroyChart(this.dataPieChartInstance);

      this.dataPieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['Event', 'Entity', ':CORR', ':DF'],
          datasets: [
            {
              label: 'number',
              data: [
                this.currentDataset!.eventNodes,
                this.currentDataset!.entityNodes,
                this.currentDataset!.corrRel,
                this.currentDataset!.dfRel
              ],
              backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
              borderColor: '#fff',
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top'
            },
            title: {
              display: true,
              text: 'Data'
            }
          }
        }
      });
    }
  }

  /**
   * Build the pie chart for dataset process executions
   */
  private createProcessPieChart(): void {
    if (!this.processPieChart) return;

    const ctx = (this.processPieChart?.nativeElement as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      this.destroyChart(this.processPieChartInstance);

      this.processPieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['Total', 'Event queries', 'Entity queries', ':Corr queries', ':DF queries'], // Etichette
          datasets: [
            {
              label: 'seconds',
              data: [
                this.currentDataset!.processInfo.durationNormalExecution,
                this.currentDataset!.processInfo.durationEventExecution,
                this.currentDataset!.processInfo.durationEntityExecution,
                this.currentDataset!.processInfo.durationCorrExecution,
                this.currentDataset!.processInfo.durationDfExecution
              ],
              backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
              borderColor: '#fff',
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top'
            },
            title: {
              display: true,
              text: 'Process query execution time'
            }
          }
        }
      });
    }
  }

  /**
   * Build the pie chart for dataset data
   */
  private createAggregateDataPieChart(): void {
    const ctx = (this.aggregateDataPieChart?.nativeElement as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      this.destroyChart(this.aggregateDataPieChartInstance);

      this.aggregateDataPieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['Class Nodes', ':OBS', ':DFC'],
          datasets: [
            {
              label: 'number',
              data: [this.currentDataset!.classNodes, this.currentDataset!.obsRel, this.currentDataset!.dfcRel],
              backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
              borderColor: '#fff',
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top'
            },
            title: {
              display: true,
              text: 'Aggregate data'
            }
          }
        }
      });
    }
  }

  /**
   * Build the pie chart for dataset process executions
   */
  private createAggregateProcessPieChart(): void {
    const ctx = (this.aggregateProcessPieChart?.nativeElement as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      this.destroyChart(this.aggregateProcessPieChartInstance);

      this.aggregateProcessPieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['Total', 'Class queries', ':OBS queries', ':DFC queries'], // Etichette
          datasets: [
            {
              label: 'seconds',
              data: [
                this.currentDataset!.processInfo.durationClassExecution,
                this.currentDataset!.processInfo.durationObsExecution,
                this.currentDataset!.processInfo.durationDfCExecution
              ],
              backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
              borderColor: '#fff',
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top'
            },
            title: {
              display: true,
              text: 'Process query execution time'
            }
          }
        }
      });
    }
  }

  /**
   * Destroy the chart instance
   * @param chart the chart
   */
  private destroyChart(chart: Chart | null): void {
    if (chart) {
      chart.destroy();
    }
  }

  /**
   * Load Dataset tile cards content
   */
  private loadDatasetDetails(): void {
    const entityTile = new DetailGraphData();
    entityTile.title = 'Event nodes';
    entityTile.dataNumber = this.currentDataset!.eventNodes;
    entityTile.dataType = GraphDataEnum.EventNodes;
    entityTile.description = `Generated ${entityTile.dataNumber} event nodes`;
    entityTile.type = 'event nodes';

    const eventTile = new DetailGraphData();
    eventTile.title = 'Entity nodes';
    eventTile.dataNumber = this.currentDataset!.entityNodes;
    eventTile.dataType = GraphDataEnum.EntityNodes;
    eventTile.description = `Generated ${eventTile.dataNumber} entity nodes`;
    eventTile.type = 'entity nodes';

    const corrTile = new DetailGraphData();
    corrTile.title = ':CORR relationships';
    corrTile.dataNumber = this.currentDataset!.corrRel;
    corrTile.dataType = GraphDataEnum.CorrLinks;
    corrTile.description = `Generated ${corrTile.dataNumber} :CORR relationships`;
    corrTile.type = ':CORR relationships';

    const dfTile = new DetailGraphData();
    dfTile.title = ':DF relationships';
    dfTile.dataNumber = this.currentDataset!.dfRel;
    dfTile.dataType = GraphDataEnum.DfcLinks;
    dfTile.description = `Generated ${dfTile.dataNumber} :DF relationships`;
    dfTile.type = ':DF relationships';

    this.detailGraphDataList.push(entityTile);
    this.detailGraphDataList.push(eventTile);
    this.detailGraphDataList.push(corrTile);
    this.detailGraphDataList.push(dfTile);
  }

  /**
   * Add the json object
   */
  private populateJsonContent(): void {
    this.jsonList.push(new JsonObject('Event nodes', false));
    this.jsonList.push(new JsonObject('Entity nodes', false));
    this.jsonList.push(new JsonObject(':CORR links', false));
    this.jsonList.push(new JsonObject(':DF links', false));
  }
}
