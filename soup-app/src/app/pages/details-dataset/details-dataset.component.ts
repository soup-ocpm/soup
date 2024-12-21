import { SpDividerComponent, SpProgressbarComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';

import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivityFilterDialogComponent } from 'src/app/components/filters-components/activity-filter-dialog/activity-filter-dialog.component';
import { FrequenceFilterDialogComponent } from 'src/app/components/filters-components/frequence-filter-dialog/frequence-filter-dialog.component';
import { PerformanceFilterDialogComponent } from 'src/app/components/filters-components/performance-filter-dialog/performance-filter-dialog.component';
import { PrimaryFilterDialogComponent } from 'src/app/components/filters-components/primary-filter-dialog/primary-filter-dialog.component';
import { TimestamFilterDialogComponent } from 'src/app/components/filters-components/timestam-filter-dialog/timestam-filter-dialog.component';
import { VariationFilterDialogComponent } from 'src/app/components/filters-components/variation-filter-dialog/variation-filter-dialog.component';
import { ModalService } from 'src/app/shared/components/s-modals/modal.service';
import { SidebarComponent } from 'src/app/shared/components/s-sidebar/s-sidebar.component';
import { SidebarService } from 'src/app/shared/components/s-sidebar/sidebar.service';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';
import { SideOperationComponent } from '../../components/side-operation/side-operation.component';
import { LoggerService } from '../../core/services/logger.service';
import { GraphDataEnum } from '../../enums/graph_data.enum';
import { Dataset } from '../../models/dataset.model';
import { DetailGraphData } from '../../models/detail_graph_data.model';
import { ClassGraphService } from '../../services/class_graph.service';
import { DatasetService } from '../../services/datasets.service';
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
    SpDividerComponent,
    SpProgressbarComponent,
    SidebarComponent,
    SideOperationComponent
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

  // Data pie chart for standard graph
  private dataPieChartInstance: any;

  // Process pie chart for standard graph
  private processPieChartInstance: any;

  // Aggregate data pie chart for class graph
  private aggregateDataPieChartInstance: any;

  // Aggregate process pie chart for class graph
  private aggregateProcessPieChartInstance: any;

  // List of the sidebar ids
  public sidebarIds: string[] = [];

  // If the progress bar is show or not
  public isLoading = false;

  // List of the filters for the analysis
  public filters = ['Timestamp', 'Performance', 'Include Activities', 'Exclude Activities', 'Frequence', 'Variation'];

  // List of the tiles
  public tiles: any[] = [];

  // List of the operations
  public operations = [
    {
      title: 'Graph Visualization',
      description: 'View the complete graph. Maximum of 200 nodes and relationships displayed',
      icon: 'analytics',
      action: () =>
        this.currentDataset?.classNodes === 0 || this.currentDataset?.classNodes === undefined
          ? this.goToGraphVisualization(true)
          : this.openGraphVisualizationSidebar()
    },
    {
      title: 'New Analysis',
      description: 'Create new analysis for this dataset',
      icon: 'add_chart',
      action: () => this.openNewAnalysisSidebar()
    },
    // {
    //   title: 'Manage Analysis',
    //   description: 'Manage the analysis.',
    //   icon: 'history',
    //   action: () => this.openHistoryAnalysisSidebar()
    // },
    {
      title: 'Aggregate Graph',
      description: 'Aggregate graph by grouping nodes into chosen classes',
      icon: 'group_work',
      action: () => this.openAggregateSidebar()
    },
    {
      title: 'Manage Datasets',
      description: 'View all datasets',
      icon: 'dashboard',
      action: () => this.goToDatasetsPage()
    }
  ];

  // Pie chart for dataset data
  @ViewChild('dataPieChart', { static: false }) dataPieChart: ElementRef | undefined;

  // Pie chart for process execution
  @ViewChild('processPieChart', { static: false }) processPieChart: ElementRef | undefined;

  // Pie chart for dataset data
  @ViewChild('aggregateDataPieChart', { static: false }) aggregateDataPieChart: ElementRef | undefined;

  // Pie chart for process execution
  @ViewChild('aggregateProcessPieChart', { static: false }) aggregateProcessPieChart: ElementRef | undefined;

  // View child template ref for master sidebar
  @ViewChild('masterSidebarTemplate', { read: TemplateRef }) masterSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for master sidebar
  @ViewChild('graphVisualizationSidebarTemplate', { read: TemplateRef }) graphVisualizationSidebarTemplate:
    | TemplateRef<unknown>
    | undefined;

  // View child template ref for master sidebar
  @ViewChild('newAnalysisSidebarTemplate', { read: TemplateRef }) newAnalysisSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for master sidebar
  @ViewChild('aggregateSidebarTemplate', { read: TemplateRef }) aggregateSidebarTemplate: TemplateRef<unknown> | undefined;

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
    private ngbModalService: NgbModal,
    private activatedRoute: ActivatedRoute,
    private supportService: LocalDataService,
    private datasetService: DatasetService,
    private logService: LoggerService,
    private classGraphService: ClassGraphService,
    public sidebarService: SidebarService,
    private standardGraphService: StandardGraphService
  ) {
    Chart.register(...registerables);
  }

  // NgOnInit implementation
  public ngOnInit(): void {
    this.sidebarService.clearAllSidebars();

    const datasetName = this.activatedRoute.snapshot.paramMap.get('name');
    this.currentDataset = this.supportService.getCurrentDataset();

    if (this.currentDataset != null && this.currentDataset.name == datasetName) {
      this.loadDatasetDetails();
      this.retrieveEntityKey();
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
   * Handle the operation to the operation card
   * @param operation the operation
   */
  public onOperationSelected(operation: any): void {
    operation.action();
  }

  /**
   * Go to de Datasets page
   */
  public goToDatasetsPage(): void {
    this.router.navigate(['datasets']);
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
   * Open the master sidebar template
   */
  public openMasterSidebar(): void {
    const sidebarId: string = 'master-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '420px',
        backgroundColor: '#f9f9f9',
        title: 'Graph Operations',
        closeIcon: false,
        stickyFooter: true,
        footerButtons: []
      },
      this.masterSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Open the master sidebar template
   */
  public openGraphVisualizationSidebar(): void {
    const sidebarId: string = 'graph-visualization-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '420px',
        backgroundColor: '#f9f9f9',
        title: 'Graph Visualization',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.graphVisualizationSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Open the new analysis sidebar
   */
  public openNewAnalysisSidebar(): void {
    const sidebarId: string = 'new-analysis';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '600px',
        backgroundColor: '#fff',
        title: 'New Analysis',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.newAnalysisSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Update the new analysis sidebar
   * @param addButtons if we want to add the footer buttons
   */
  public updateNewAnalysisSidebar(addButtons: boolean): void {
    const sidebarId: string = 'new-analysis';

    if (addButtons) {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [
          { label: 'Build', action: () => {}, color: 'var(--primary-color)' },
          { label: 'Restore', action: () => {}, color: '#6c757d' }
        ]
      });
    } else {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: []
      });
    }
  }

  /**
   * Add new analysisi
   */
  public addNewAnalysisTile(): void {
    // Open the modal
    const modalRef = this.ngbModalService.open(PrimaryFilterDialogComponent);
    modalRef.result
      .then((selectedFilter) => {
        if (selectedFilter) {
          this.openFilterDialog(selectedFilter);
        }
      })
      .catch((error) => console.error('Modal error:', error));
  }

  /**
   * Open the filter dialog
   */
  public openFilterDialog(filter: string) {
    let filterModal;

    switch (filter) {
      case 'Timestamp':
        filterModal = this.ngbModalService.open(TimestamFilterDialogComponent);
        break;

      case 'Performance':
        filterModal = this.ngbModalService.open(PerformanceFilterDialogComponent);
        break;

      case 'Include Activities':
        filterModal = this.ngbModalService.open(ActivityFilterDialogComponent);
        filterModal.componentInstance.inputData = true;
        break;

      case 'Exclude Activities':
        filterModal = this.ngbModalService.open(ActivityFilterDialogComponent);
        filterModal.componentInstance.inputData = false;
        break;

      case 'Frequence':
        filterModal = this.ngbModalService.open(FrequenceFilterDialogComponent);
        break;

      case 'Variation':
        filterModal = this.ngbModalService.open(VariationFilterDialogComponent);
        break;

      default:
        console.error('Filtro non riconosciuto:', filter);
        return;
    }

    filterModal.result
      .then((result) => {
        if (result) {
          console.log(result);
          this.tiles.push({ type: filter, details: result });
        }
      })
      .catch((error) => console.error('Modal error:', error));
  }

  /**
   * Open the analysis history
   */
  public openHistoryAnalysisSidebar(): void {
    const sidebarId: string = 'history-analysis';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '400px',
        backgroundColor: '#fff',
        title: 'History of analysis',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.newAnalysisSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Open the master sidebar template
   */
  public openAggregateSidebar(): void {
    const sidebarId: string = 'aggregate-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '420px',
        backgroundColor: '#f9f9f9',
        title: 'Group by class',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.aggregateSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Update the aggregation sidebar
   * @param addButtons if we want to add the footer buttons
   */
  public updateAggregateSidebar(addButtons: boolean): void {
    const sidebarId: string = 'aggregate-sidebar';

    // Update the Sidebar configuration

    if (addButtons) {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [
          { label: 'Build', action: () => this.buildClassGraph(), color: 'var(--primary-color)' },
          { label: 'Restore', action: () => this.resetSelection(), color: '#6c757d' }
        ]
      });
    } else {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: []
      });
    }
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
    this.sidebarService.close('aggregate-sidebar');
    this.sidebarService.close('master-sidebar');

    const formData: FormData = new FormData();
    formData.append('dataset_name', this.currentDataset!.name);

    try {
      this.classGraphService.createClassGraph(formData, this.selectedEntities, this.currentDataset!.name).subscribe({
        next: (response) => {
          if (response.statusCode === 201 && response.responseData != null) {
            this.currentDataset = this.supportService.updateDatasetInfo(response.responseData);
            this.isLoading = false;
            this.sidebarService.reOpen('master-sidebar');
            this.sidebarService.close('aggregate-sidebar');
            this.resetSelection();

            setTimeout(() => {
              this.createCharts();
            }, 300);
          } else {
            this.sidebarService.reOpen('master-sidebar');
            this.sidebarService.reOpen('aggregate-sidebar');
            this.isLoading = false;
            this.toast.show('Error while creating Class Graph. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData) => {
          const apiResponse: any = errorData;
          this.logService.error(apiResponse);
          this.sidebarService.reOpen('master-sidebar');
          this.sidebarService.reOpen('aggregate-sidebar');
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

    // Update the sidebar configuration
    if (this.selectedEntities.length > 0) {
      this.updateAggregateSidebar(true);
    } else {
      this.updateAggregateSidebar(false);
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

    this.updateAggregateSidebar(false);
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

      this.openMasterSidebar();
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
}
