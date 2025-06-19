// eslint-disable-next-line simple-import-sort/imports
import { SpDividerComponent, SpProgressbarComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Chart, registerables } from 'chart.js';
import { AnalysisDialogComponent } from 'src/app/components/analysis-dialog/analysis-dialog.component';
import { ActivityFilterDialogComponent } from 'src/app/components/filters-components/activity-filter-dialog/activity-filter-dialog.component';
import { ActivityFilter } from 'src/app/components/filters-components/activity-filter-dialog/activity-filter.model';
import { MasterFiltersDialogComponent } from 'src/app/components/filters-components/master-filters-dialog/master-filters-dialog.component';
import { PerformanceFilterDialogComponent } from 'src/app/components/filters-components/performance-filter-dialog/performance-filter-dialog.component';
import { PerformanceFilter } from 'src/app/components/filters-components/performance-filter-dialog/performance-filter.model';
import { TimestamFilterDialogComponent } from 'src/app/components/filters-components/timestam-filter-dialog/timestam-filter-dialog.component';
import { TimestampFilter } from 'src/app/components/filters-components/timestam-filter-dialog/timestamp-filter.model';
import { GraphType } from 'src/app/enums/graph_type.enum';
import { Analysis } from 'src/app/models/analysis.mdel';
import { AnalysisService } from 'src/app/services/analysis.service';
import { DatasetService } from 'src/app/services/datasets.service';
import { ModalService } from 'src/app/shared/components/s-modals/modal.service';
import { SidebarComponent } from 'src/app/shared/components/s-sidebar/s-sidebar.component';
import { SidebarService } from 'src/app/shared/components/s-sidebar/sidebar.service';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';

import { FrequenceFilterDialogComponent } from 'src/app/components/filters-components/frequence-filter-dialog/frequence-filter-dialog.component';
import { FrequenceFilter } from 'src/app/components/filters-components/frequence-filter-dialog/frequence-filter.model';
import { VariantFilterDialogComponent } from 'src/app/components/filters-components/variant-filter-dialog/variant-filter-dialog.component';
import { VariantFilter } from 'src/app/components/filters-components/variant-filter-dialog/variant-filter.model';
import { ApiResponse } from 'src/app/core/models/api_response.model';
import { EntityObjectList } from 'src/app/models/entity.model';
import { OnBoardingService } from 'src/app/services/onboarding.service';
import { SideOperationComponent } from '../../components/side-operation/side-operation.component';
import { LoggerService } from '../../core/services/logger.service';
import { GraphData } from '../../enums/graph_data.enum';
import { Dataset } from '../../models/dataset.model';
import { DetailGraphData } from '../../models/detail_graph_data.model';
import { ClassGraphService } from '../../services/class_graph.service';
import { StandardGraphService } from '../../services/standard_graph.service';
import { ToastLevel } from '../../shared/components/s-toast/toast_type.enum';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

/**
 * Detail dataset component
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
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
    SpSpinnerComponent,
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
  public entityList: EntityObjectList[] = [];

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

  // All graph entities for the filters
  public allGraphEntities: string[] = [];

  // List of the filters for the analysis
  public filters = ['Timestamp', 'Performance', 'Include Activities', 'Exclude Activities'];

  // List of the tiles
  public tiles: any[] = [];

  // Timestamp filters
  public timestampFilters: TimestampFilter[] = [];

  // Performance filter
  public performanceFilters: PerformanceFilter[] = [];

  // Include activities filters
  public includeActivitiesFilters: ActivityFilter[] = [];

  // Exclude activities filters
  public excludeActivitiesFilters: ActivityFilter[] = [];

  // Activity freqeyncy filters
  public frequenceFilters: FrequenceFilter[] = [];

  // Variant filters
  public variantFilters: VariantFilter[] = [];

  // If the user uploaded the file configuration for new analysis
  public jsonConfiguration = false;

  // If the tiles was created by uploading the configuration json file
  public createTilesByFile = false;

  // The json configuration example for the info
  public exampleJSONConfiguration: any;

  // Retrieve all analysis
  public allAnalyses: Analysis[] = [];

  // The selected analysis
  public selectedAnalysis: Analysis | undefined;

  // If we have already add buttons
  public alreadyAddButtons = false;

  // The search
  public searchTerm = '';

  // List of the operations
  public operations = [
    {
      title: 'Graph Visualization',
      description: 'View the complete graph. Maximum of 200 nodes and relationships displayed',
      icon: 'analytics',
      loading: false,
      action: () =>
        this.currentDataset?.classNodes === 0 || this.currentDataset?.classNodes === undefined
          ? this.goToGraphVisualization(GraphType.Standard, null, null)
          : this.openGraphVisualizationSidebar()
    },
    {
      title: 'Aggregate Graph',
      description: 'Aggregate graph by grouping nodes into chosen classes',
      icon: 'group_work',
      loading: false,
      action: () => this.openAggregateSidebar()
    },
    {
      title: 'New Analysis',
      description: 'Create new analysis for this dataset',
      icon: 'add_chart',
      loading: false,
      action: () => this.getGraphEntities()
    },
    {
      title: 'Manage Datasets',
      description: 'View all datasets',
      icon: 'dashboard',
      loading: false,
      action: () => this.goToDatasetsPage()
    },
    {
      title: 'Delete Dataset',
      description: 'This operation is not reversible',
      icon: 'delete_forever',
      loading: false,
      action: () => this.openModalDeleteDataset()
    }
  ];

  // If the progress bar is show or not
  public isLoading = false;

  // If the analysis is applying
  public isLoadingAnalysis = false;

  // If there is loading for map configuration json file to tiles
  public isLoadingConfiguration = false;

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

  // View child template ref for graph visualization sidebar
  @ViewChild('graphVisualizationSidebarTemplate', { read: TemplateRef }) graphVisualizationSidebarTemplate:
    | TemplateRef<unknown>
    | undefined;

  // View child template ref for new analysis sidebar
  @ViewChild('newAnalysisSidebarTemplate', { read: TemplateRef }) newAnalysisSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for history analyses sidebar
  @ViewChild('analysesSidebarTemplate', { read: TemplateRef }) analysesSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for json configuration info sidebar
  @ViewChild('infoJSONConfigurationSidebarTemplate', { read: TemplateRef }) infoJSONConfigurationSidebarTemplate:
    | TemplateRef<unknown>
    | undefined;

  // View child template ref for aggregation sidebar
  @ViewChild('aggregateSidebarTemplate', { read: TemplateRef }) aggregateSidebarTemplate: TemplateRef<unknown> | undefined;

  /**
   * Constructor for DetailsDatasetComponent component
   * @param router the Router
   * @param httpClient the HTTPClient client
   * @param toast the NotificationService service
   * @param modalService the ModalService service
   * @param activatedRoute the ActivatedRoute
   * @param supportService the LocalDataService service
   * @param logger the LoggerService service
   * @param jsonDataService the JSONDataService service
   * @param classGraphService the ClassGraphService service
   * @param analysisService the AnalysisService service
   * @param datasetService the DatasetService service
   * @param graphService the StandardGraphService service
   */
  constructor(
    private router: Router,
    private httpClient: HttpClient,
    private cdRef: ChangeDetectorRef,
    private dialog: MatDialog,
    private modal: ModalService,
    private toast: NotificationService,
    private modalService: ModalService,
    private ngbModalService: NgbModal,
    private activatedRoute: ActivatedRoute,
    private supportService: LocalDataService,
    private logger: LoggerService,
    private classGraphService: ClassGraphService,
    public sidebarService: SidebarService,
    private analysisService: AnalysisService,
    private datasetService: DatasetService,
    private onBoardingService: OnBoardingService,
    private graphService: StandardGraphService
  ) {
    Chart.register(...registerables);
  }

  // NgOnInit implementation
  public ngOnInit(): void {
    this.sidebarService.clearAllSidebars();
    this.loadJSONConfigurationExample();

    const datasetName = this.activatedRoute.snapshot.paramMap.get('name');
    this.currentDataset = this.supportService.getCurrentDataset();

    if (this.currentDataset != null && this.currentDataset.name == datasetName) {
      this.loadDatasetDetails();

      setTimeout(() => {
        this.loadEntityKey();
      }, 500);

      this.loadDatasetActivities();

      setTimeout(() => {
        this.loadEventMinMaxTimestamp();
      }, 200);

      // Create the chart
      setTimeout(() => {
        this.createDataPieChart();
        this.createProcessPieChart();
      }, 200);

      setTimeout(() => {
        this.getFirstTimeUsage();
      }, 200);
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
  public goToGraphVisualization(graphType: GraphType, analysisName: string | null, content: any | null): void {
    this.supportService.graphType = graphType;

    if (graphType != GraphType.Filtered) {
      this.router.navigate(['datasets', this.currentDataset!.name, 'graph']);
    } else {
      this.router.navigate(['datasets', this.currentDataset!.name, analysisName, 'graph'], { state: { customData: content } });
    }
  }

  /**
   * Open the master sidebar template
   */
  public openMasterSidebar(): void {
    const sidebarId = 'master-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '420px',
        backgroundColor: '#f9f9f9',
        title: 'Dataset Operations',
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
    const sidebarId = 'graph-visualization-sidebar';

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
   * Show the modal for json cofiguration analysis
   */
  public requestFileConfiguration(): void {
    // Reset the previous configuration
    this.jsonConfiguration = false;
    this.createTilesByFile = false;
    this.isLoadingConfiguration = false;

    // Show the modal
    this.modalService.showGenericModal(
      'Import Configuration',
      'Would you like to load a pre-existing JSON file with your saved analysis settings and filters, or start fresh using our visual editor?',
      true,
      false,
      '',
      'Upload',
      'var(--primary-color)',
      'Start Fresh',
      '#000000',
      () => this.preOpenNewAnalysisSidebar(true),
      () => null,
      () => this.preOpenNewAnalysisSidebar(false)
    );
  }

  /**
   * Prepare the sidebar for the new analysis
   * @param configurationFile if the user have the configuration file
   */
  public preOpenNewAnalysisSidebar(configurationFile: boolean): void {
    this.jsonConfiguration = configurationFile;
    this.openNewAnalysisSidebar();
  }

  /**
   * Open the new analysis sidebar
   */
  public openNewAnalysisSidebar(): void {
    const sidebarId = 'new-analysis';

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
   * Open the info json configuration sidebar
   */
  public openInfoJSONConfigurationSidebar(): void {
    const sidebarId = 'json-configuration';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '600px',
        backgroundColor: '#fff',
        title: 'What is JSON Configuration ?',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.infoJSONConfigurationSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Close the example json configuration sidebar
   */
  public closeInfoJSONConfigurationSidebar(): void {
    this.sidebarService.close('json-configuration');
  }

  /**
   * Trigger the file input
   */
  public triggerFileInput(): void {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    if (fileInput) {
      fileInput.click();
    }
  }

  /**
   * Handle the upload json file configuration
   * @param event the event
   */
  public onFileChange(event: any): void {
    const file = event.target.files[0];

    if (file && file.type === 'application/json') {
      this.uploadJson(file);
    } else {
      this.toast.show('Only .json file', ToastLevel.Error, 3000);
    }
  }

  /**
   * Handle the upload configuration json file
   * @param file the file
   */
  private uploadJson(file: File): void {
    const reader = new FileReader();

    reader.onload = (e: any) => {
      const jsonString = e.target.result;

      try {
        const parsedJson = JSON.parse(jsonString);
        this.parseAndValidateJson(parsedJson);
      } catch (error) {
        console.error('Errore nel parsing del file JSON:', error);
      }
    };

    reader.readAsText(file);
  }

  /**
   * Parse and validate the json configuration file
   * @param json the json
   */
  private parseAndValidateJson(json: any): void {
    this.isLoadingConfiguration = true;
    const analysis = new Analysis();

    // Validate the timestamp filters
    analysis.timestampFilters = this.validateArray(json.timestamp, this.validateTimestampFilter);

    // Validate the performance filters
    analysis.performanceFilters = this.validateArray(json.performance, this.validatePerformanceFilter);

    // Validate the activities filters (include and exclude)
    analysis.includeActivitiesFilters = this.validateArray(json.includeActivities, this.validateActivityFilter);
    analysis.excludeActivitiesFilters = this.validateArray(json.excludeActivities, this.validateActivityFilter);

    // Validate the frequence filters
    analysis.frequenceFilters = this.validateArray(json.frequence, this.validateFrequenceFilter);

    // Validate the variant filters
    analysis.variantFilters = this.validateArray(json.variant, this.validateVariantFilter);

    // Finally create the tiles
    this.createTiles(analysis);
  }

  /**
   * Create the tiles for the new analysis
   * @param analysis the analysis
   */
  private createTiles(analysis: Analysis): void {
    this.tiles = [];

    // Timestamp filters
    if (analysis.timestampFilters && analysis.timestampFilters.length > 0) {
      analysis.timestampFilters.forEach((filter: any) => {
        // Add official filter
        const timestampFilter = new TimestampFilter();
        timestampFilter.startDate = filter.startDate;
        timestampFilter.endDate = filter.endDate;

        this.timestampFilters.push(timestampFilter);

        // Add tile
        this.tiles.push({
          type: 'Timestamp',
          details: {
            startDate: filter.startDate,
            endDate: filter.endDate
          }
        });
      });
    }

    // Performance filters
    if (analysis.performanceFilters && analysis.performanceFilters.length > 0) {
      analysis.performanceFilters.forEach((filter: any) => {
        // Add official filter
        const performanceFilter = new PerformanceFilter();
        performanceFilter.entity = filter.entity;
        performanceFilter.operator = filter.operator;
        performanceFilter.seconds = filter.seconds;

        this.performanceFilters.push(performanceFilter);

        // Add tile
        this.tiles.push({
          type: 'Performance',
          details: {
            entity: filter.entity,
            operator: filter.operator,
            seconds: filter.seconds
          }
        });
      });
    }

    // Include activities filters
    if (analysis.includeActivitiesFilters && analysis.includeActivitiesFilters.length > 0) {
      analysis.includeActivitiesFilters.forEach((filter: any) => {
        // Add official filter
        const includeActivitiesFilter = new ActivityFilter();
        includeActivitiesFilter.activities = filter.activities;
        includeActivitiesFilter.include = true;

        this.includeActivitiesFilters.push(includeActivitiesFilter);

        // Add tile
        this.tiles.push({
          type: 'Include Activities',
          details: {
            activities: filter.activities
          }
        });
      });
    }

    // Exclude activities filter
    if (analysis.excludeActivitiesFilters && analysis.excludeActivitiesFilters.length > 0) {
      analysis.excludeActivitiesFilters.forEach((filter: any) => {
        // Add official filter
        const excludeActivitiesFilter = new ActivityFilter();
        excludeActivitiesFilter.activities = filter.activities;
        excludeActivitiesFilter.include = false;

        this.excludeActivitiesFilters.push(excludeActivitiesFilter);

        // Add tile
        this.tiles.push({
          type: 'Exclude Activities',
          details: {
            activities: filter.activities
          }
        });
      });
    }

    // Frequence filters
    if (analysis.frequenceFilters && analysis.frequenceFilters.length > 0) {
      analysis.frequenceFilters.forEach((filter: any) => {
        // Add official filter
        const frequenceFilter = new FrequenceFilter();
        frequenceFilter.entity = filter.entity;
        frequenceFilter.operator = filter.operator;
        frequenceFilter.frequency = filter.frequency;

        this.frequenceFilters.push(frequenceFilter);

        // Add tile
        this.tiles.push({
          type: 'Frequence',
          details: {
            entity: filter.entity,
            operator: filter.operator,
            frequency: filter.frequency
          }
        });
      });
    }

    // Variant filters
    if (analysis.variantFilters && analysis.variantFilters.length > 0) {
      analysis.variantFilters.forEach((filter: any) => {
        // Add official filter
        const variantFilter = new VariantFilter();
        variantFilter.entity = filter.entity;
        variantFilter.operator = filter.operator;
        variantFilter.variant = filter.variant;

        this.variantFilters.push(variantFilter);

        // Add tile
        this.tiles.push({
          type: 'Variant',
          details: {
            entity: filter.entity,
            operator: filter.operator,
            variant: filter.variant
          }
        });
      });
    }

    this.isLoadingConfiguration = false;
    this.createTilesByFile = true;
    this.updateNewAnalysisSidebar(true);
  }

  /**
   * Update the new analysis sidebar
   * @param addButtons if we want to add the footer buttons
   */
  public updateNewAnalysisSidebar(addButtons: boolean): void {
    const sidebarId = 'new-analysis';

    if (addButtons) {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [
          { label: 'Build', action: () => this.requestAnalysisName(), color: 'var(--primary-color)' },
          { label: 'Restore', action: () => this.resetAnalysisTiles(), color: '#6c757d' }
        ]
      });
    } else {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: []
      });
    }
  }

  /**
   * Update the calculate variation sider operation
   * @param add if we want to add the loading or not
   */
  public updateCalculateVariationOperation(add: boolean): void {
    const newAnalysisIndex = this.operations.findIndex((op) => op.title === 'New Analysis');

    if (newAnalysisIndex !== -1) {
      // Change the loading attribute
      this.operations[newAnalysisIndex] = {
        ...this.operations[newAnalysisIndex],
        loading: add
      };
    }
  }

  /**
   * Retrieve all graph entities
   */
  public getGraphEntities(): void {
    this.updateCalculateVariationOperation(true);
    this.graphService.getEntityNodes(true).subscribe({
      next: (response) => {
        if (response != null && response.statusCode === 200 && response.responseData != null) {
          const data = response.responseData;

          if (data != null && data.length > 0) {
            // Save the entity type
            data.forEach((item: any) => {
              const entity = item.Type;
              if (entity != null && !this.allGraphEntities.includes(entity)) {
                this.allGraphEntities.push(entity);
              }
            });

            // Request new analysis type (file or manual)
            this.updateCalculateVariationOperation(false);
            this.requestFileConfiguration();
          } else {
            // No content
            this.updateCalculateVariationOperation(false);
            this.logger.error('No entities found.', response.message);
            this.toast.showWithTitle(
              'Missing Entity',
              'No entities found. Please check data and retry.',
              true,
              false,
              null,
              ToastLevel.Error,
              3000
            );
          }
        } else if (response != null && response.statusCode === 202) {
          // No content
          this.updateCalculateVariationOperation(false);
          this.logger.error('No entities found.', response.message);
          this.toast.showWithTitle(
            'Missing Entity',
            'No entities found. Please check data and retry.',
            true,
            false,
            null,
            ToastLevel.Error,
            3000
          );
        } else {
          // Error
          this.updateCalculateVariationOperation(false);
          this.logger.error('Unable to load the entities', response.message);
          this.toast.showWithTitle('Entities', 'Unable to load the entities. Please retry.', true, false, null, ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        // Error
        this.updateCalculateVariationOperation(false);
        this.logger.error('Unable to load the entities. Status code: ', errorData.statusCode + ' Message: ' + errorData.message);
        this.toast.showWithTitle('Entities', 'Unable to load the entities. Please retry.', true, false, null, ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Add new analysisi
   */
  public addNewAnalysisTile(): void {
    if (this.allGraphEntities == null || this.allGraphEntities.length === 0) {
      this.toast.showWithTitle(
        'Missing Entity',
        'No entities found. Please check data and retry.',
        true,
        false,
        null,
        ToastLevel.Error,
        3000
      );
      return;
    }
    // Open the modal
    const modalRef = this.ngbModalService.open(MasterFiltersDialogComponent);
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
        filterModal.componentInstance.allEntities = this.allGraphEntities; // add data to component (entities)
        break;

      case 'Include Activities':
        filterModal = this.ngbModalService.open(ActivityFilterDialogComponent);
        filterModal.componentInstance.inputData = true; // add data to component  (bool include)
        break;

      case 'Exclude Activities':
        filterModal = this.ngbModalService.open(ActivityFilterDialogComponent);
        filterModal.componentInstance.inputData = false; // add data to component  (bool include)
        break;

      case 'Frequence':
        filterModal = this.ngbModalService.open(FrequenceFilterDialogComponent);
        filterModal.componentInstance.allEntities = this.allGraphEntities; // add data to component (entities)
        break;

      case 'Variant':
        filterModal = this.ngbModalService.open(VariantFilterDialogComponent);
        filterModal.componentInstance.allEntities = this.allGraphEntities; // add data to component (entities)
        break;

      default:
        return;
    }

    filterModal.result
      .then((result) => {
        if (result) {
          this.addNewTile(filter, result);
        }
      })
      .catch((reason) => {
        if (reason === 'close-and-return') {
          // Re-open the master modal
          this.addNewAnalysisTile();
        } else {
          console.warn('Filter modal closed with reason:', reason);
        }
      });
  }

  /**
   * Add new filter to the appropriate array and update tiles
   */
  private addNewTile(filterType: string, filterDetails: any): void {
    switch (filterType) {
      case 'Timestamp':
        // Add official filter
        this.timestampFilters.push(filterDetails.timestamp);

        // Add tile
        this.tiles.push({
          type: filterType,
          details: filterDetails.timestamp
        });

        break;
      case 'Performance':
        // Add official filter
        this.performanceFilters.push(filterDetails.performance);

        // Add tile
        this.tiles.push({
          type: filterType,
          details: filterDetails.performance
        });
        break;
      case 'Include Activities':
        // Add official filter
        this.includeActivitiesFilters.push(filterDetails.activities);

        // Add tile
        this.tiles.push({
          type: filterType,
          details: filterDetails.activities
        });
        break;
      case 'Exclude Activities':
        // Add official filter
        this.excludeActivitiesFilters.push(filterDetails.activities);

        // Add tile
        this.tiles.push({
          type: filterType,
          details: filterDetails.activities
        });
        break;

      case 'Frequence':
        // Add official filter
        this.frequenceFilters.push(filterDetails.frequence);
        console.log(this.frequenceFilters);

        // Add tile
        this.tiles.push({
          type: filterType,
          details: filterDetails.frequence
        });
        break;

      case 'Variant':
        // Add official filter
        this.variantFilters.push(filterDetails.variant);
        console.log(this.variantFilters);

        // Add tile
        this.tiles.push({
          type: filterType,
          details: filterDetails.variant
        });
        break;

      default:
        console.error('Filter not found:', filterType);
        return;
    }

    // Update sidebar configuration
    if (this.tiles.length > 0 && !this.alreadyAddButtons) {
      this.updateNewAnalysisSidebar(true);
      this.alreadyAddButtons = true;
    }
  }

  /**
   * Remove a tile
   * @param tile La tile da eliminare
   */
  public deleteTile(tile: any): void {
    const index = this.tiles.indexOf(tile);
    if (index !== -1) {
      this.tiles.splice(index, 1);
    }

    if (this.tiles.length == 0) {
      this.updateNewAnalysisSidebar(false);
      this.alreadyAddButtons = false;
    }
  }

  /**
   * Reset the new filters
   */
  public resetAnalysisTiles(): void {
    this.tiles = [];
    this.performanceFilters = [];
    this.timestampFilters = [];
    this.includeActivitiesFilters = [];
    this.excludeActivitiesFilters = [];
    this.frequenceFilters = [];
    this.variantFilters = [];
    this.updateNewAnalysisSidebar(false);
    this.alreadyAddButtons = false;
  }

  /**
   * Create the paylaoad request
   * @returns the payload
   */
  public buildFiltersPayload(): any {
    const payload = {
      timestamp: this.timestampFilters.map((filter: any) => ({
        startDate: filter.startDate,
        endDate: filter.endDate
      })),
      performance: this.performanceFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        seconds: filter.seconds
      })),
      includeActivities: this.includeActivitiesFilters.map((filter: any) => ({
        activities: filter.activities
      })),
      excludeActivities: this.excludeActivitiesFilters.map((filter: any) => ({
        activities: filter.activities
      })),
      frequence: this.frequenceFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        frequency: filter.frequency
      })),
      variant: this.variantFilters.map((filter: any) => ({
        entity: filter.entity,
        operator: filter.operator,
        variant: filter.variant
      }))
    };

    return payload;
  }

  /**
   * Request the analysis name dialog
   */
  public requestAnalysisName(): void {
    this.modal.showInputModal(
      'Analysis information',
      'Please enter these information for create new Analysis',
      true,
      this.currentDataset!.name,
      false,
      'Build',
      'var(--primary-color)',
      'Close',
      '#6c757d',
      (datasetName: string, datasetDescription: string) => {
        return this.retrieveModalData(datasetName, datasetDescription);
      },
      () => {
        this.modal.hideInputModal();
      }
    );
  }

  /**
   * Catch the dataset input information
   * @param analysisName the dataset name
   * @param analysisDescription the dataset informaton
   * timestamp execution
   */
  private retrieveModalData(analysisName: string, analysisDescription: string): Promise<void> {
    this.buildAnalysis(analysisName, analysisDescription);
    return Promise.resolve();
  }

  /**
   * Build the new analysis
   */
  public buildAnalysis(analysisName: string, analysisDescription: string): void {
    const payload = this.buildFiltersPayload();

    if (payload != null) {
      this.isLoadingAnalysis = true;

      // Create payload
      payload['dataset_name'] = this.currentDataset?.name;
      payload['analysis_name'] = analysisName;
      payload['analysis_description'] = analysisDescription;

      // Update sidebar configuration
      this.updateNewAnalysisSidebar(false);

      // Call the API
      this.analysisService.createAnalysis(payload).subscribe({
        next: (response) => {
          if ((response.statusCode == 200 || response.statusCode == 201) && response.responseData != null) {
            const data = response.responseData;
            this.isLoadingAnalysis = false;
            this.sidebarService.close('new-analysis');
            this.toast.show('Analysis created successfully.', ToastLevel.Success, 3000);
            this.goToGraphVisualization(GraphType.Filtered, analysisName, data);
          } else if (response.statusCode == 204) {
            this.isLoadingAnalysis = false;
            this.updateNewAnalysisSidebar(true);
            // We can remove the analysis
            this.deleteAnalysis(analysisName, false);

            this.logger.warn('No content with these filters.');
            this.toast.show('No content with these filters. Try applying different filters.', ToastLevel.Warning, 3000);
          } else {
            this.isLoadingAnalysis = false;
            this.updateNewAnalysisSidebar(true);
            // We can remove the analysis
            this.deleteAnalysis(analysisName, false);

            this.logger.error('Unable to create the analysis' + response.statusCode);
            this.toast.show('Unable to create the analysis due an error. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.isLoadingAnalysis = false;
          this.updateNewAnalysisSidebar(true);
          // We can remove the analysis
          this.deleteAnalysis(analysisName, false);

          this.logger.error('Unable to create the analysis' + errorData.statusCode);
          this.toast.show('Unable to create the analysis due an error. Retry', ToastLevel.Error, 3000);
        }
      });
    }
  }

  /**
   * Open the analysis history sidebar
   */
  public openHistoryAnalysisSidebar(): void {
    const sidebarId = 'analyses';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '600px',
        backgroundColor: '#fff',
        title: 'History of analysis',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.analysesSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Close the analysis history sidebar
   */
  public closeHistoryAnalysisSidebar(): void {
    this.sidebarService.close('analyses');
  }

  /**
   * Process an already exists analysis
   * @param analysis the analysis
   */
  public processAnalysis(analysis: Analysis): void {
    if (analysis != null) {
      // Loading status
      this.isLoadingAnalysis = true;

      this.analysisService.processAnalysis(this.currentDataset!.name, analysis.analysisName).subscribe({
        next: (response) => {
          if (response.statusCode === 201 && response.responseData != null) {
            // Get the response
            const data = response.responseData;
            this.isLoadingAnalysis = false;
            this.sidebarService.close('analyses');
            this.toast.show('Analysis created successfully.', ToastLevel.Success, 3000);

            // Restore the class graph
            this.currentDataset!.classNodes = 0;
            this.currentDataset!.obsRel = 0;
            this.currentDataset!.dfcRel = 0;
            this.supportService.setCurrentDataset(this.currentDataset!);

            // Go to graph visualization
            this.goToGraphVisualization(GraphType.Filtered, analysis.analysisName, data);
          } else if (response.statusCode === 204) {
            this.isLoadingAnalysis = false;
            this.sidebarService.reOpen('master-sidebar');
            this.sidebarService.reOpen('analyses');

            this.logger.warn('No content with these filters');
            this.toast.show('No content with these filters. Try applying different filters', ToastLevel.Warning, 3000);
          } else {
            this.sidebarService.reOpen('master-sidebar');
            this.sidebarService.reOpen('analyses');

            this.logger.error('Error while applying the filter analysis', response.message);
            this.toast.show('Error while applying the filter analysis. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.isLoadingAnalysis = false;
          this.sidebarService.reOpen('master-sidebar');
          this.sidebarService.reOpen('analyses');

          this.logger.error('Error while applying the filter analysis', errorData.message);
          this.toast.show('Error while applying the filter analysis. Retry', ToastLevel.Error, 3000);
        }
      });
    }
  }

  /**
   * Open the modal for delete the analysis
   * @param analysis the analysis to remove
   */
  public openModalDeleteAnalysis(analysis: Analysis): void {
    if (this.currentDataset != null) {
      const title = 'Delete' + ' ' + analysis.analysisName + ' ' + 'analysis?';

      this.modalService.showDeleteDatasetModal(
        title,
        'Are you sure you want to delete this Analysis? This operation is not reversible',
        analysis.analysisName,
        false,
        'Delete',
        '#FF0000',
        'Cancel',
        '#555',
        (name: string) => {
          return this.preDeleteAnalysis(name);
        },
        () => {
          this.modalService.hideDeleteDatasetModal();
        }
      );
    }
  }

  /**
   * Catch the promise and data from modal
   * @param analysisName the analysis name
   */
  public preDeleteAnalysis(analysisName: string): Promise<void> {
    if (analysisName !== null && analysisName != '') {
      this.deleteAnalysis(analysisName, true);
    }

    return Promise.resolve();
  }

  /**
   * Delete specific analysis
   * @param analysis the analysis to remove
   */
  public deleteAnalysis(analysisName: string, includeToast: boolean): void {
    this.analysisService.deleteAnalysis(this.currentDataset!.name, analysisName).subscribe({
      next: (response) => {
        if (response.statusCode === 200) {
          this.currentDataset!.analyses = this.currentDataset!.analyses.filter((item) => item.analysisName !== analysisName);

          if (this.currentDataset!.analyses.length == 0) {
            this.updateOperationList('remove');
            this.closeHistoryAnalysisSidebar();
          }

          if (includeToast) {
            this.toast.show(analysisName + ' ' + 'analysis deleted successfully', ToastLevel.Success, 3000);
          }
        } else {
          if (includeToast) {
            this.logger.error('Unable to delete analysis', response.message);
            this.toast.show('Unable to delete analysis. Please retry.', ToastLevel.Error, 3000);
          }
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to delete analysis', errorData.message);

        if (includeToast) {
          this.toast.show('Unable to delete analysis. Please retry.', ToastLevel.Error, 3000);
        }
      }
    });
  }

  /**
   * Filter the analysis by the search
   * @returns the tile
   */
  public filteredAnalysis() {
    if (!this.searchTerm) {
      return this.currentDataset!.analyses;
    }

    return this.currentDataset!.analyses.filter((analysis) => analysis.analysisName.toLowerCase().includes(this.searchTerm.toLowerCase()));
  }

  /**
   * Handle the zoom in specific analysis
   * @param analysis the analysis
   */
  public onZoomAnalysis(analysis: Analysis): void {
    this.dialog.open(AnalysisDialogComponent, {
      data: analysis,
      width: '800px',
      minHeight: '700px',
      maxHeight: '700px',
      disableClose: false
    });
  }

  /**
   * Open the master sidebar template
   */
  public openAggregateSidebar(): void {
    const sidebarId = 'aggregate-sidebar';

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
        footerButtons: [{ label: 'Build', action: () => this.buildClassGraph(), color: 'var(--primary-color)' }]
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
    const sidebarId = 'aggregate-sidebar';

    // Update the sidebar configuration
    if (addButtons) {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [
          { label: 'Build', action: () => this.buildClassGraph(), color: 'var(--primary-color)' },
          { label: 'Restore', action: () => this.resetSelection(), color: '#6c757d' }
        ]
      });
    } else {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [{ label: 'Build', action: () => this.buildClassGraph(), color: 'var(--primary-color)' }]
      });
    }
  }

  /**
   * Delete the previous class graph
   */
  public deletePreviousClassGraph(): void {
    this.classGraphService.deleteGraph().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          this.buildClassGraph();
        } else {
          this.logger.error('Unable to create the aggregate graph', response.message);
          this.toast.show('Unable to create the aggregate graph.', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to create the aggregate graph', errorData.message);
        this.toast.show('Unable to create the aggregate graph.', ToastLevel.Error, 3000);
      }
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

            this.toast.show('Class graph created successfully', ToastLevel.Success, 3000);
          } else {
            this.isLoading = false;

            this.sidebarService.reOpen('master-sidebar');
            this.sidebarService.reOpen('aggregate-sidebar');

            this.logger.error('Error while creating aggregate Graph', response.message);
            this.toast.show('Error while creating aggregate Graph. Check the info and retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.isLoading = false;

          this.sidebarService.reOpen('master-sidebar');
          this.sidebarService.reOpen('aggregate-sidebar');

          this.logger.error('Error while creating aggregate Graph', errorData.message);
          this.toast.show('Error while creating aggregate Graph. Check the info and retry', ToastLevel.Error, 3000);
        }
      });
    } catch (error) {
      this.logger.error('Internal Server Error', error);
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
   * Load the different activities
   */
  private loadDatasetActivities(): void {
    // Reset the previous analysis
    this.currentDataset!.analyses = [];

    // Get the analysis
    this.graphService.getActivitiesName().subscribe({
      next: (response) => {
        if (response.statusCode == 200 || response.statusCode == 202 || response.statusCode == 204) {
          this.currentDataset!.allActivities = response.responseData as string[];
        } else {
          this.logger.error('Unable to load Dataset distinct activities', response.message);
          this.toast.show('Unable to load Dataset distinct activities. Please retry.', ToastLevel.Error, 3000);
        }

        this.loadDatasetAnalyses();
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to load Dataset distinct activities', errorData.message);
        this.toast.show('Unable to load Dataset distinct activities. Please retry.', ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Retrieve entities from the Dataset
   */
  private loadEntityKey(): void {
    this.graphService.getEntityKey().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;
          data.forEach((item: any) => {
            this.entityList.push(new EntityObjectList(item, 0));
          });

          this.retrieveNaNEntity();
        } else {
          this.logger.error('Unable to load the Dataset entity keys', response.message);
          this.toast.show('Unable to load the Dataset entity keys', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to load the Dataset entity keys', errorData.message);
        this.toast.show('Unable to load the Dataset entity keys', ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Retrieve NaN entity from the Dataset
   */
  private retrieveNaNEntity(): void {
    const nullEntities: string[] = [];

    this.graphService.getNullEntities().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;

          data.forEach((item: any) => {
            nullEntities.push(item);
          });

          this.entityList.forEach((entity: EntityObjectList) => {
            nullEntities.forEach((item: any) => {
              if (item.property_name == entity.name) {
                entity.numberOfNanNodes = item.count_nodes;
              }
            });
          });
        } else {
          this.logger.error('Unable to load the Dataset NaN keys', response.message);
          this.toast.show('Unable to load the Dataset NaN keys', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to load the Dataset NaN keys', errorData.message);
        this.toast.show('Unable to load the Dataset NaN keys', ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Load information about min and max event timestamp
   */
  private loadEventMinMaxTimestamp(): void {
    this.graphService.getMinMaxTimestamp().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const timestampData = response.responseData;

          // Get the information
          const minTimestampDate = timestampData['minDate'];
          const maxTimestampDate = timestampData['maxDate'];

          if (minTimestampDate != null && maxTimestampDate != null) {
            this.currentDataset!.minEventDateTime = minTimestampDate;
            this.currentDataset!.maxEventDateTime = maxTimestampDate;
          }
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to load min and max Dataset timestamp activities', errorData.message);
      }
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
          labels: ['Event', 'Entity', 'CORR', 'DF'],
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
              text: 'Occurrencies'
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
          //labels: ['Total', 'Event queries', 'Entity queries', ':CORR queries', ':DF queries'], // Etichette
          labels: ['Event', 'Entity', 'CORR', 'DF'], // Etichette
          datasets: [
            {
              label: 'seconds',
              data: [
                //this.currentDataset!.processInfo.durationNormalExecution,
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
          labels: ['Class Nodes', 'OBS', 'DF_C'],
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
          //labels: ['Total', 'Class queries', ':OBS queries', ':DFC queries'],
          labels: ['Class queries', 'OBS queries', 'DF_C queries'],
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
   * Load the dataset analysis
   */
  private loadDatasetAnalyses(): void {
    this.analysisService.getAllAnalyses(this.currentDataset!.name).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const allAnalysis = response.responseData;

          if (allAnalysis.length > 0) {
            allAnalysis.forEach((item: any) => {
              const newAnalysis = new Analysis();
              newAnalysis.datasetName = item['dataset_name'];
              newAnalysis.analysisName = item['analysis_name'];
              newAnalysis.analysisDescription = item['analysis_description'];
              newAnalysis.timestampFilters = item['timestamp'];
              newAnalysis.performanceFilters = item['performance'];
              newAnalysis.includeActivitiesFilters = item['includeActivities'];
              newAnalysis.excludeActivitiesFilters = item['excludeActivities'];
              newAnalysis.frequenceFilters = item['frequence'];
              newAnalysis.variantFilters = item['variant'];

              this.currentDataset!.analyses.push(newAnalysis);
            });
          }

          if (this.currentDataset!.analyses.length > 0) {
            this.updateOperationList('add');
          }
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to retrieve the Dataset Analyses', errorData.message);
        this.toast.show('Unable to retrieve the Dataset Analyses. Retry', ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Update the operation list by adding or removing a specific operation.
   * @param actionType - 'add' to add the operation, 'remove' to remove it
   */
  private updateOperationList(actionType: 'add' | 'remove') {
    const manageAnalysisIndex = this.operations.findIndex((op) => op.title === 'Manage Analysis');

    if (actionType === 'add') {
      // Add the new operation
      if (manageAnalysisIndex === -1 && !this.operations.some((op) => op.title === 'Manage Analysis')) {
        const newAnalysisIndex = this.operations.findIndex((op) => op.title === 'New Analysis');
        if (newAnalysisIndex !== -1) {
          this.operations.splice(newAnalysisIndex + 1, 0, {
            title: 'Manage Analysis',
            description: 'Manage the analysis.',
            icon: 'history',
            loading: false,
            action: () => this.openHistoryAnalysisSidebar()
          });

          setTimeout(() => {
            this.cdRef.detectChanges();
          });
        }
      }
    } else if (actionType === 'remove') {
      // Remove the operation
      if (manageAnalysisIndex !== -1) {
        this.operations.splice(manageAnalysisIndex, 1);
      }
    }
  }

  /**
   * Load Dataset tile cards content
   */
  private loadDatasetDetails(): void {
    const entityTile = new DetailGraphData();
    entityTile.title = 'Event nodes';
    entityTile.dataNumber = this.currentDataset!.eventNodes;
    entityTile.dataType = GraphData.EventNodes;
    entityTile.description = `Generated ${entityTile.dataNumber} event nodes`;
    entityTile.type = 'event nodes';

    const eventTile = new DetailGraphData();
    eventTile.title = 'Entity nodes';
    eventTile.dataNumber = this.currentDataset!.entityNodes;
    eventTile.dataType = GraphData.EntityNodes;
    eventTile.description = `Generated ${eventTile.dataNumber} entity nodes`;
    eventTile.type = 'entity nodes';

    const corrTile = new DetailGraphData();
    corrTile.title = ':CORR relationships';
    corrTile.dataNumber = this.currentDataset!.corrRel;
    corrTile.dataType = GraphData.CorrLinks;
    corrTile.description = `Generated ${corrTile.dataNumber} :CORR relationships`;
    corrTile.type = ':CORR relationships';

    const dfTile = new DetailGraphData();
    dfTile.title = ':DF relationships';
    dfTile.dataNumber = this.currentDataset!.dfRel;
    dfTile.dataType = GraphData.DfcLinks;
    dfTile.description = `Generated ${dfTile.dataNumber} :DF relationships`;
    dfTile.type = ':DF relationships';

    this.detailGraphDataList.push(entityTile);
    this.detailGraphDataList.push(eventTile);
    this.detailGraphDataList.push(corrTile);
    this.detailGraphDataList.push(dfTile);
  }

  /**
   * Function to validate an array of TimestampFilters
   * @param array The array to be validated
   * @returns The validated array
   */
  private validateArray<T>(array: any[], validator: (item: any) => T): T[] {
    if (!array || array.length === 0) {
      return [];
    }

    if (!Array.isArray(array)) {
      throw new Error('Expected an array');
    }

    return array.map(validator);
  }

  /**
   * Function to validate a TimestampFilter
   * @param filter The filter to be validated
   * @returns A validated TimestampFilter object
   */
  private validateTimestampFilter(filter: any): TimestampFilter {
    if (!filter.startDate || !filter.endDate) {
      throw new Error('Invalid TimestampFilter');
    }

    const timestampFilter = new TimestampFilter();
    timestampFilter.startDate = new Date(filter.startDate);
    timestampFilter.endDate = new Date(filter.endDate);

    return timestampFilter;
  }

  /**
   * Function to validate a PerformanceFilter
   * @param filter The filter to be validated
   * @returns A validated PerformanceFilter object
   */
  private validatePerformanceFilter(filter: any): PerformanceFilter {
    if (!filter.entity || !filter.operator || !filter.seconds) {
      throw new Error('Invalid PerformanceFilter');
    }

    const performanceFilter = new PerformanceFilter();
    performanceFilter.entity = filter.entity;
    performanceFilter.operator = filter.operator;
    performanceFilter.seconds = filter.seconds;

    return performanceFilter;
  }

  /**
   * Function to validate an ActivityFilter
   * @param filter The filter to be validated
   * @returns A validated ActivityFilter object
   */
  private validateActivityFilter(filter: any): ActivityFilter {
    if (!Array.isArray(filter.activities) || filter.activities.length === 0) {
      throw new Error('Invalid ActivityFilter');
    }

    const activityFilter = new ActivityFilter();
    activityFilter.activities = filter.activities;
    activityFilter.include = filter.include || false;

    return activityFilter;
  }

  /**
   * Function to validate a FrequenceFilter
   * @param filter The filter to be validated
   * @returns A validated FrequenceFilter object
   */
  private validateFrequenceFilter(filter: any): FrequenceFilter {
    if (!filter.entity || !filter.operator || !filter.frequency) {
      throw new Error('Invalid FrequenceFilter');
    }

    const frequenceFilter = new FrequenceFilter();
    frequenceFilter.entity = filter.entity;
    frequenceFilter.operator = filter.operator;
    frequenceFilter.frequency = filter.frequency;

    return frequenceFilter;
  }

  /**
   * Function to validate a VariantFilter
   * @param filter The filter to be validated
   * @returns A validated VariantFilter object
   */
  private validateVariantFilter(filter: any): VariantFilter {
    if (!filter.entity || !filter.operator || !filter.variant) {
      throw new Error('Invalid VariantFilter');
    }

    const variantFilter = new VariantFilter();
    variantFilter.entity = filter.entity;
    variantFilter.operator = filter.operator;
    variantFilter.variant = filter.variant;

    return variantFilter;
  }

  /**
   * Load the example json configuration
   */
  private loadJSONConfigurationExample(): void {
    this.httpClient.get<any>('help/file_configuration_example.json').subscribe({
      next: (response) => {
        this.exampleJSONConfiguration = response;
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to load the example json configuration' + errorData.message);
      }
    });
  }

  /**
   * Handle the click for delete EKG
   */
  public openModalDeleteDataset(): void {
    if (this.currentDataset != null) {
      const title = 'Delete' + ' ' + this.currentDataset!.name + ' ' + 'Dataset?';

      this.modalService.showDeleteDatasetModal(
        title,
        'Are you sure you want to delete this Dataset? This operation is not reversible',
        this.currentDataset!.name,
        true,
        'Delete',
        '#FF0000',
        'Cancel',
        '#555',
        (name: string) => {
          return this.preDeleteDataset(name);
        },
        () => {
          this.modalService.hideDeleteDatasetModal();
        }
      );
    }
  }

  /**
   * Catch the promise and data from modal
   * @param name the name
   */
  public preDeleteDataset(name: string): Promise<void> {
    if (name !== null && name != '') {
      this.deleteDataset();
    }

    return Promise.resolve();
  }

  /**
   * Delete the Dataset
   */
  private deleteDataset(): void {
    if (this.currentDataset != null) {
      this.datasetService.deleteDataset(this.currentDataset!.name).subscribe({
        next: (response) => {
          if (response.statusCode == 200) {
            // Now we can remove the Memgraph data
            this.deleteMemgraphData();
          } else {
            this.logger.error('Unable to delete the Dataset', response.message);
            this.toast.show('Unable to delete the Dataset. Please retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.logger.error('Unable to delete the Dataset', errorData.message);
          this.toast.show('Unable to delete the Dataset. Please retry', ToastLevel.Error, 3000);
        }
      });
    }
  }

  /**
   * Remove the current content inside memgraph database
   */
  private deleteMemgraphData(): void {
    this.graphService.deleteGraph().subscribe({
      next: (response) => {
        if (response.statusCode == 200) {
          this.toast.show('Dataset deleted successfully', ToastLevel.Success, 3000);
          this.supportService.removeCurrentDataset();
          this.router.navigate(['/welcome']);
        } else {
          this.logger.error('Unable to delete the Memgraph Data', response.message);
          this.toast.show('Unable to delete the Memgraph Data. Please retry', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to delete the Memgraph Data', errorData.message);
        this.toast.show('Unable to delete the Memgraph Data. Please retry', ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Get the json configuration example
   */
  public getExampleJSON(): any {
    return this.exampleJSONConfiguration;
  }

  /**
   * Check the first time usage
   */
  private getFirstTimeUsage(): void {
    this.onBoardingService.getFirstTimeUsage().subscribe({
      next: (response) => {
        if (response.statusCode === 200 && response.responseData != null) {
          const firstTime = response.responseData;

          // Is the first time, so we need to show the modal
          if (firstTime) {
            this.modalService.showGenericModal(
              'Welcome to SOUP!',
              `Thanks for using SOUP. We're happy to have you on board! 🎉

              If you’d like to share your thoughts, you can leave feedback using the button at the top right of the Home Page.`,
              false,
              false,
              '',
              'Got it!',
              'var(--primary-color)',
              '',
              '',
              () => {},
              () => {
                return Promise.resolve();
              },
              () => {}
            );

            // Create the first time usage node
            setTimeout(() => {
              this.setFirstTimeUsage();
            }, 200);
          }
        }
      },
      error: (error) => {
        this.logger.error('Unable to load the first time usage.', error.toString());
      }
    });
  }

  /**
   * Set the first time usage
   */
  private setFirstTimeUsage(): void {
    this.onBoardingService.setFirstTimeUsage().subscribe({
      next: (response) => {
        if (response.statusCode === 200 && response.responseData != null) {
          this.logger.info('Set the first time usage');
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to set the first time usage', errorData.message);
      }
    });
  }
}
