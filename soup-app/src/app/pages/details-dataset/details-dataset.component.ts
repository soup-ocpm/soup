import { SpDividerComponent, SpProgressbarComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';

import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ActivityFilterDialogComponent } from 'src/app/components/filters-components/activity-filter-dialog/activity-filter-dialog.component';
import { ActivityFilter } from 'src/app/components/filters-components/activity-filter-dialog/activity-filter.model';
import { AnalysisDialogComponent } from 'src/app/components/filters-components/analysis-dialog/analysis-dialog.component';
import { FrequenceFilterDialogComponent } from 'src/app/components/filters-components/frequence-filter-dialog/frequence-filter-dialog.component';
import { PerformanceFilterDialogComponent } from 'src/app/components/filters-components/performance-filter-dialog/performance-filter-dialog.component';
import { PerformanceFilter } from 'src/app/components/filters-components/performance-filter-dialog/performance-filter.model';
import { PrimaryFilterDialogComponent } from 'src/app/components/filters-components/primary-filter-dialog/primary-filter-dialog.component';
import { TimestamFilterDialogComponent } from 'src/app/components/filters-components/timestam-filter-dialog/timestam-filter-dialog.component';
import { TimestampFilter } from 'src/app/components/filters-components/timestam-filter-dialog/timestamp-filter.model';
import { VariationFilterDialogComponent } from 'src/app/components/filters-components/variation-filter-dialog/variation-filter-dialog.component';
import { Analysis } from 'src/app/models/analysis.mdel';
import { AnalysisService } from 'src/app/services/analysis.service';
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

  // Timestamp filters
  public timestampFilters: TimestampFilter[] = [];

  // Performance filter
  public performanceFilters: PerformanceFilter[] = [];

  // Include activities filters
  public includeActivitiesFilters: ActivityFilter[] = [];

  // Exclude activities filters
  public excludeActivitiesFilters: ActivityFilter[] = [];

  // If the user uploaded the file configuration for new analysis
  public jsonConfiguration: boolean = false;

  // If the tiles was created by uploading the configuration json file
  public createTilesByFile: boolean = false;

  // The json configuration example for the info
  public exampleJSONConfiguration: any;

  // If there is loading for map configuration json file to tiles
  public isLoadingConfiguration: boolean = false;

  // Retrieve all analysis
  public allAnalyses: Analysis[] = [];

  // The selected analysis
  public selectedAnalysis: Analysis | undefined;

  // If we have already add buttons
  public alreadyAddButtons: boolean = false;

  // The search
  public searchTerm = '';

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
      action: () => this.requestFileConfiguration()
    },
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
   * @param logService the LoggerService service
   * @param jsonDataService the JSONDataService service
   * @param classGraphService the ClassGraphService service
   * @param analysisService the AnalysisService service
   * @param standardGraphService the StandardGraphService service
   */
  constructor(
    private router: Router,
    private httpClient: HttpClient,
    private dialog: MatDialog,
    private modal: ModalService,
    private toast: NotificationService,
    private modalService: ModalService,
    private ngbModalService: NgbModal,
    private activatedRoute: ActivatedRoute,
    private supportService: LocalDataService,
    private logService: LoggerService,
    private classGraphService: ClassGraphService,
    public sidebarService: SidebarService,
    private analysisService: AnalysisService,
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
      this.loadJSONConfigurationExample();
      this.loadDatasetDetails();
      this.loadDatasetAnalyses();
      this.loadDatasetActivities();
      this.loadEntityKey();
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
   * Show the modal for json cofiguration analysis
   */
  public requestFileConfiguration(): void {
    // Reset the previous configuration
    this.jsonConfiguration = false;
    this.createTilesByFile = false;
    this.isLoadingConfiguration = false;

    // Show the modal
    this.modalService.showGenericModal(
      'JSON Configuration?',
      'Do you want to import a json configuration file containing filters?',
      true,
      'Yes',
      'var(--primary-color)',
      'No, create manually',
      '#000000',
      () => this.preOpenNewAnalysisSidebar(true),
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
   * Open the info json configuration sidebar
   */
  public openInfoJSONConfigurationSidebar(): void {
    const sidebarId: string = 'json-configuration';

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

    // Leggi il contenuto del file come stringa
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

    // Validate the activities filters
    analysis.includeActivitiesFilters = this.validateArray(json.includeActivities, this.validateActivityFilter);
    analysis.excludeActivitiesFilterss = this.validateArray(json.excludeActivities, this.validateActivityFilter);

    // Finally create the tiles
    this.createTiles(analysis);
  }

  /**
   * Create the tiles for the new analysis
   * @param analysis the analysis
   */
  private createTiles(analysis: Analysis): void {
    this.tiles = [];

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

    if (analysis.performanceFilters && analysis.performanceFilters.length > 0) {
      analysis.performanceFilters.forEach((filter: any) => {
        // Add official filter
        const performanceFilter = new PerformanceFilter();
        performanceFilter.startActivity = filter.startActivity;
        performanceFilter.endActivity = filter.endActivity;
        performanceFilter.seconds = filter.seconds;

        this.performanceFilters.push(performanceFilter);

        // Add tile
        this.tiles.push({
          type: 'Performance',
          details: {
            startActivity: filter.startActivity,
            endActivity: filter.endActivity,
            seconds: filter.seconds
          }
        });
      });
    }

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

    if (analysis.excludeActivitiesFilterss && analysis.excludeActivitiesFilterss.length > 0) {
      analysis.excludeActivitiesFilterss.forEach((filter: any) => {
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

    this.isLoadingConfiguration = false;
    this.createTilesByFile = true;
    this.updateNewAnalysisSidebar(true);
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
        this.logService.error('Filter not found.', filter);
        return;
    }

    filterModal.result
      .then((result) => {
        if (result) {
          this.addNewTile(filter, result);
        }
      })
      .catch((error) => console.error('Modal error:', error));
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
      default:
        console.error('Tipo di filtro non riconosciuto:', filterType);
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
        startActivity: filter.startActivity,
        endActivity: filter.endActivity,
        seconds: filter.seconds
      })),
      includeActivities: this.includeActivitiesFilters.map((filter: any) => ({
        activities: filter.activities
      })),
      excludeActivities: this.excludeActivitiesFilters.map((filter: any) => ({
        activities: filter.activities
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
      (datasetName: string, datasetDescription: string, saveProcessExecution: boolean) => {
        return this.retrieveModalData(datasetName, datasetDescription, saveProcessExecution);
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
   * @param saveProcessExecution if the user want to save the
   * timestamp execution
   */
  private retrieveModalData(analysisName: string, analysisDescription: string, saveProcessExecution: boolean): Promise<void> {
    this.buildAnalysis(analysisName, analysisDescription);
    return Promise.resolve();
  }

  /**
   * Build the new analysis
   */
  public buildAnalysis(analysisName: string, analysisDescription: string): void {
    const payload = this.buildFiltersPayload();

    if (payload != null) {
      console.log('Sono dentro');
      payload['dataset_name'] = this.currentDataset?.name;
      payload['analysis_name'] = analysisName;
      payload['analysis_description'] = analysisDescription;

      // Call the API
      this.analysisService.createAnalysis(payload).subscribe({
        next: (responseData) => {
          console.log('Analisi creata con successo:', responseData);
          // TODO: implementare
        },
        error: (errorData) => {
          console.error("Errore nella creazione dell'analisi:", errorData);
        }
      });
    }
  }

  /**
   * Open the analysis history sidebar
   */
  public openHistoryAnalysisSidebar(): void {
    const sidebarId: string = 'analyses';

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
      this.analysisService.processAnalysis(this.currentDataset!.name, analysis.analysisName).subscribe({
        next: (response) => {},
        error: (error) => {},
        complete: () => {}
      });
    }
  }

  /**
   * Delete specific analysis
   * @param analysis the analysis to remove
   */
  public deleteAnalysis(analysis: Analysis): void {
    this.analysisService.deleteAnalysis(this.currentDataset!.name, analysis.analysisName).subscribe({
      next: (response) => {
        if (response.statusCode === 200) {
          this.currentDataset!.analyses = this.currentDataset!.analyses.filter((item) => item.analysisName !== analysis.analysisName);

          if (this.currentDataset!.analyses.length == 0) {
            this.updateOperationList('remove');
            this.closeHistoryAnalysisSidebar();
          }
          this.toast.show('Analysis deleted successfully', ToastLevel.Success, 3000);
        } else {
          this.toast.show('Unable to delete analysis. Please retry.', ToastLevel.Error, 3000);
        }
      },
      error: (error) => {
        this.logService.error(error);
        this.toast.show('Unable to delete analysis. Please retry.', ToastLevel.Error, 3000);
      },
      complete: () => {}
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
  public onZoomAnalysis(analysis: Analysis) {
    this.dialog.open(AnalysisDialogComponent, {
      data: analysis,
      width: '800px',
      minHeight: '700px',
      maxHeight: '700px',
      disableClose: false
    });
  }

  /**
   * Get the total number of filters
   * @param analysis the analysis
   * @returns the number of filters
   */
  public getTotalAnalysisFilter(analysis: Analysis): number {
    return (
      analysis.timestampFilters.length +
      analysis.performanceFilters.length +
      analysis.includeActivitiesFilters.length +
      analysis.excludeActivitiesFilterss.length
    );
  }

  /**
   * Get the analysis filter in string format
   */
  public getAnalysisFiltersString(analysis: Analysis): string {
    const filters = [];

    if (analysis.timestampFilters.length > 0) filters.push('Timestamp');
    if (analysis.performanceFilters.length > 0) filters.push('Performance');
    if (analysis.includeActivitiesFilters.length > 0) filters.push('Include Activity');
    if (analysis.excludeActivitiesFilterss.length > 0) filters.push('Exclude Activity');

    return filters.join(', ');
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
   * Load the different activities
   */
  private loadDatasetActivities(): void {
    this.standardGraphService.getActivitiesName().subscribe({
      next: (response) => {
        if (response.statusCode == 200) {
          this.currentDataset!.allActivities = response.responseData as string[];
          console.log(this.currentDataset!.allActivities);
        } else {
          this.logService.error(response.message);
          this.toast.show('Unable to load some Dataset data. Please retry.', ToastLevel.Error, 3000);
        }
      },
      error: (error) => {
        this.logService.error(error);
        this.toast.show('Unable to load some Dataset data. Please retry.', ToastLevel.Error, 3000);
      },
      complete: () => {}
    });
  }

  /**
   * Retrieve entities from the Dataset
   */
  private loadEntityKey(): void {
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
              newAnalysis.excludeActivitiesFilterss = item['excludeActivities'];

              this.currentDataset!.analyses.push(newAnalysis);
            });
          }

          if (this.currentDataset!.analyses.length > 0) {
            this.updateOperationList('add');
          }
        }
      },
      error: (error) => {
        this.logService.error(error);
        this.toast.show('Unable to retrieve the Dataset Analyses. Retry', ToastLevel.Error, 3000);
      },
      complete: () => {}
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
            action: () => this.openHistoryAnalysisSidebar()
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
   * Function to validate an array of TimestampFilters
   * @param array The array to be validated
   * @returns The validated array
   */
  private validateArray<T>(array: any[], validator: (item: any) => T): T[] {
    if (!array || array.length === 0) {
      return []; // Returns an empty array if it's undefined or empty
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
    if (!filter.startActivity || !filter.endActivity || !filter.seconds) {
      throw new Error('Invalid PerformanceFilter');
    }

    const performanceFilter = new PerformanceFilter();
    performanceFilter.startActivity = filter.startActivity;
    performanceFilter.endActivity = filter.endActivity;
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
   * Load the example json configuration
   */
  private loadJSONConfigurationExample(): void {
    this.httpClient.get<any>('file_configuration_example.json').subscribe({
      next: (response) => {
        this.exampleJSONConfiguration = response;
      },
      error: (error) => {
        this.logService.error('Unable to load the json configuration example');
      }
    });
  }

  /**
   * Get the json configuration example
   */
  public getExampleJSON(): any {
    return this.exampleJSONConfiguration;
  }
}
