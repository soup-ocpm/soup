import { SpDividerComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { CommonModule, Location } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
import saveAs from 'file-saver';
import { concatMap, from, map, Observable, toArray } from 'rxjs';
import { GraphType } from 'src/app/enums/graph_type.enum';
import { EntityObjectList } from 'src/app/models/entity.model';
import { FrequencyFilter } from 'src/app/models/frequency_filter.model';
import { JsonObject } from 'src/app/models/json.model';
import { VariationFilter } from 'src/app/models/variation_filter.model';
import { AnalysisService } from 'src/app/services/analysis.service';
import { ClassGraphService } from 'src/app/services/class_graph.service';
import { ModalService } from 'src/app/shared/components/s-modals/modal.service';
import { SidebarService } from 'src/app/shared/components/s-sidebar/sidebar.service';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';

import { SideOperationComponent } from '../../components/side-operation/side-operation.component';
import { ApiResponse } from '../../core/models/api_response.model';
import { LoggerService } from '../../core/services/logger.service';
import { Dataset } from '../../models/dataset.model';
import { DatasetService } from '../../services/datasets.service';
import { GenericGraphService } from '../../services/generic_graph.service';
import { JSONDataService } from '../../services/json_data.service';
import { StandardGraphService } from '../../services/standard_graph.service';
import { SidebarComponent } from '../../shared/components/s-sidebar/s-sidebar.component';
import { ToastLevel } from '../../shared/components/s-toast/toast_type.enum';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

/**
 * Graph visualization component
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-graph',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    // Component import
    SpDividerComponent,
    SpSpinnerComponent,
    SidebarComponent,
    SideOperationComponent
  ],
  templateUrl: './graph.component.html',
  styleUrl: './graph.component.scss'
})
export class GraphComponent implements OnInit, AfterViewInit {
  // The dataset name
  public currentDataset: Dataset | undefined;

  // The variable for the g graph.
  public g: any;

  // The SVG of the Graph
  public svg: any;

  // Variable for the zoom
  public zoom: any;

  // Zoom of the SVG.
  public currentZoomEvent: any;

  // All edges of Class Graph.
  public nodes: any = [];

  // All edges of Class Graph.
  public edges: any = [];

  // Map id to name node
  private nodeNameMap: Record<string, string> = {};

  // All type of relationships
  public allRelationships: { name: string; selected: boolean }[] = [];

  // List of node type (rectangular or circular)
  public allNodesViewType: string[] = ['Rectangular', 'Circular'];

  // Selected the type of node
  public nodeViewType = 'Rectangular';

  // The weight scale for relationships weight
  private weightScale: any;

  // Map for track colors for Edges
  public relationLabelColors: Map<string, string> = new Map<string, string>();

  // The search
  public searchTerm = '';

  // Search string by User for search nodes or links
  public searchQuery = '';

  // Searched results (nodes or links)
  public searchResults: any[] = [];

  // Result about the search or not
  public researched: boolean | undefined;

  // The current tab inside the Search sidebar tabber
  public currentTabIndex = 0;

  // Number for nodes inside the Sidebar
  public itemsPerPage = 10;

  // Current Sidebar page
  public currentPage = 1;

  // The displayed nodes inside Sidebar
  public displayedNodes: any[] = [];

  // The displayed edges inside Sidebar
  public displayedEdges: any[] = [];

  // The total unique node showed on the ekg
  public totalUniqueNodeShowed = 0;

  // The total unique node showed on the ekg bak
  public totalUniqueNodeShowedBak = 0;

  // The total unique rel showed on the ekg
  public totalUniqueRelShowed = 0;

  // The max data to show  on the graph
  public maxDataToShow = 0;

  // Selected the researched node
  public selectedNode: any;

  // Selected the researched edge
  public selectedEdge: any;

  // Selected result for searched Node
  public selectedResult: any;

  // Properties of the researched Node
  public propertiesSelectedNode: any = [];

  // If the user search node or links
  public isSearchMode = false;

  // If the card for node properties is show or not
  public isShowCardProperties: boolean | undefined;

  // List of the sidebar ids
  public sidebarIds: string[] = [];

  // The calculated frequency
  public frequencyResults: FrequencyFilter[] = [];

  // The calculated variations
  public variationResults: VariationFilter[] = [];

  // The json object list
  public jsonList: JsonObject[] = [];

  // List of the selected json content
  public selectedJson: string[] = [];

  // The entity list for aggregated graph
  public entityList: EntityObjectList[] = [];

  // List of selected entities
  public selectedEntities: string[] = [];

  // The analysis name if we watch filtered ekg
  public analysisName = '';

  // The loading state
  public isLoading = false;

  // Loading nodes for scrollbar
  public loadingFewData = false;

  // Loading new nodes
  public isLoadingNewNodes = false;

  // If the user attend download the json
  public isLoadingJsonDownload = false;

  // Should show arrow back
  public shouldShowArrowBack = false;

  // List of the operations
  public operations = [
    {
      title: 'Manage Graph View',
      description: 'Change the view of your graph',
      icon: 'view_quilt',
      loading: false,
      action: () => this.openGraphManager()
    },
    {
      title: 'Export JSON',
      description: 'Export and save the full JSON of the nodes and edges',
      icon: 'file_download',
      loading: false,
      action: () => this.openJSONSidebar()
    },
    {
      title: 'Export SVG',
      description: 'Export and save the SVG of the graph',
      icon: 'picture_as_pdf',
      loading: false,
      action: () => this.exportSvg()
    }
  ];

  // ElementRef container to show SVG of the Graph.
  @ViewChild('graphSvg', { static: true }) graphContainer!: ElementRef;

  // ElementRef container for node list inside the Search sidebar
  @ViewChild('scrollNodeContainer') scrollNodeContainer!: ElementRef;

  // ElementRef container for edges list inside the Search sidebar
  @ViewChild('scrollEdgesContainer') scrollEdgesContainer!: ElementRef;

  // View child template ref for master sidebar
  @ViewChild('masterSidebarTemplate', { read: TemplateRef }) masterSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for search sidebar
  @ViewChild('searchSidebarTemplate', { read: TemplateRef }) searchSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for aggregation sidebar
  @ViewChild('aggregateSidebarTemplate', { read: TemplateRef }) aggregateSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for json sidebar
  @ViewChild('frequencySidebarTemplate', { read: TemplateRef }) frequencySidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for json sidebar
  @ViewChild('variationSidebarTemplate', { read: TemplateRef }) variationSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for json sidebar
  @ViewChild('jsonSidebarTemplate', { read: TemplateRef }) jsonSidebarTemplate: TemplateRef<unknown> | undefined;

  // View child template ref for manage graph sidebar
  @ViewChild('manageGraphSidebarTemplate', { read: TemplateRef }) manageGraphSidebarTemplate: TemplateRef<unknown> | undefined;

  // Color palette for Edges
  private predefinedColors: string[] = [
    '#3f51b5',
    '#ff5722',
    '#4caf50',
    '#e91e63',
    '#ffc107',
    '#795548',
    '#00bcd4',
    '#9c27b0',
    '#8bc34a',
    '#2196f3',
    '#ff9800',
    '#607d8b',
    '#009688',
    '#f44336',
    '#673ab7'
  ];

  /**
   * Constructor for GraphComponent component
   * @param router the Router
   * @param location the Location
   * @param cdt the ChangeDetectorRef changeDetector
   * @param toast the NotificationService service
   * @param activatedRoute the ActivatedRoute
   * @param modalService the ModalService service
   * @param datasetService the DatasetService service
   * @param jsonDataService the JSONDataService service
   * @param logger the LoggerService service
   * @param sidebarService the SidebarService service
   * @param standardGraphService  the StandardGraphService service
   * @param aggregateGraphService the ClassGraphService service
   * @param genericGraphService the GenericGraphService service
   * @param analysisService the AnalysisService service
   * @param supportService the LocalDataService service
   */
  constructor(
    private router: Router,
    private location: Location,
    private cdt: ChangeDetectorRef,
    private toast: NotificationService,
    private activatedRoute: ActivatedRoute,
    private modalService: ModalService,
    private datasetService: DatasetService,
    private jsonDataService: JSONDataService,
    private logger: LoggerService,
    public sidebarService: SidebarService,
    private standardGraphService: StandardGraphService,
    private aggregateGraphService: ClassGraphService,
    private genericGraphService: GenericGraphService,
    private analysisService: AnalysisService,
    public supportService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit() {
    this.sidebarService.clearAllSidebars();

    const datasetName = this.activatedRoute.snapshot.paramMap.get('name');
    this.currentDataset = this.supportService.getCurrentDataset();

    if (this.currentDataset == null || this.currentDataset.name !== datasetName) {
      this.toast.show('Dataset unknow, unable to retrieve Graph. Retry', ToastLevel.Error, 3000);
      this.router.navigate(['/welcome']);
      return;
    }

    // Create the dagre d3 g object
    this.g = new dagreD3.graphlib.Graph().setGraph({ rankdir: 'LR' });

    if (this.supportService.graphType != GraphType.Filtered) {
      this.shouldShowArrowBack = true;
      this.getGraphDetails(200, false);
    } else {
      // Get the analysis name
      this.activatedRoute.paramMap.subscribe((params) => {
        this.analysisName = params.get('analysisName')!;
      });

      // Get the state content
      const state = this.location.getState();

      if (state && (state as any).customData) {
        const data = (state as any).customData;
        this.injectData(data);
      }
    }

    // Add json content options and operations
    this.populateJsonContent();
    this.updateOperations();

    setTimeout(() => {
      this.getMaxDataToShow();
    }, 1000);
  }

  // NgAfterViewInit implementation
  public ngAfterViewInit() {
    setTimeout(() => {
      if (this.scrollNodeContainer?.nativeElement) {
        this.scrollNodeContainer.nativeElement.addEventListener('scroll', () => {
          this.onScrollNodes();
        });
      }

      if (this.scrollEdgesContainer?.nativeElement) {
        this.scrollEdgesContainer.nativeElement.addEventListener('scroll', () => {
          this.onScrollEdges();
        });
      }
    });
  }

  /**
   * Get the graph details
   */
  private getGraphDetails(node: number, updateMaxDataShow: boolean): void {
    const standardGraph = this.supportService.graphType == GraphType.Standard ? '1' : '0';

    this.genericGraphService.getGraph(node, standardGraph).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;
          const graphData = data['graph_data'];
          this.totalUniqueNodeShowedBak = this.totalUniqueNodeShowed;

          if (updateMaxDataShow) {
            setTimeout(() => {
              this.getMaxDataToShow();
            }, 1000);
          }

          // Now we can inject data
          this.injectData(graphData);
        } else {
          this.isLoading = false;

          this.logger.error('Unable to retrieve Graph data', response.message);
          this.toast.show('Unable to retrieve Graph data. Retry', ToastLevel.Error, 3000);
          this.router.navigate(['/datasets', this.currentDataset!.name]);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.isLoading = false;

        this.logger.error('Unable to retrieve Graph data', errorData.message);
        this.toast.show('Unable to retrieve Graph data. Retry', ToastLevel.Error, 3000);
        this.router.navigate(['/datasets', this.currentDataset!.name]);
      }
    });
  }

  /**
   * Inject the data for prepare the EKG
   * @param data the data
   */
  private injectData(data: any): void {
    const uniqueNodes: Set<any> = new Set<any>();
    const uniqueDfRelationships: Set<any> = new Set<any>();
    this.relationLabelColors.clear();

    data.forEach((item: any) => {
      // Node source
      const nodeSource = item['node_source'];
      nodeSource['label'] = nodeSource['ActivityName'];
      this.addNode(uniqueNodes, nodeSource);

      // Relation
      const edge = item['edge'];

      let edgeWeight = 1;

      if (edge['edge_weight'] != null) {
        edgeWeight = edge['edge_weight'];
      }

      let label = edge['Type'];

      if (edge['relation'] != null) {
        label = edge['relation'];
      }

      const link = {
        auto_id: edge['id'],
        weight: edgeWeight,
        source: nodeSource,
        target: null,
        personal_id: null,
        label: label
      };

      if (edge['ID'] != null) {
        link.personal_id = edge['ID'];
      }

      // Node target
      const nodeTarget = item['node_target'];
      nodeTarget['label'] = nodeTarget['ActivityName'];

      if (nodeTarget != null) {
        this.addNode(uniqueNodes, nodeTarget);
        link.target = nodeTarget;
      }

      uniqueDfRelationships.add(link);
    });

    this.nodes = Array.from(uniqueNodes);
    this.edges = [...uniqueDfRelationships];

    this.assignRelationLabelColors(this.edges);
    this.createGraphVisualization(this.graphContainer, 'myGraphContainer');
  }

  /**
   * Create and show the EKG
   * @param graphContainer the container HTML for show the Graph.
   * @param htmlId the html id.
   */
  private createGraphVisualization(graphContainer: ElementRef, htmlId: string): void {
    const container = document.getElementById(htmlId);
    if (container) {
      const width: number = container.clientWidth;
      const height: number = container.clientHeight;

      // Create graph
      this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: true }).setGraph({ rankdir: 'LR', nodesep: 25, multiedgesep: 10 });

      // Add nodes
      this.nodes.forEach((node: any): void => {
        const nodeId = node.id;
        const nodeName = node.ActivityName;
        const nodeProperties: any = {
          label: nodeName
        };

        for (const prop in node) {
          if (Object.prototype.hasOwnProperty.call(node, prop)) {
            nodeProperties[prop] = node[prop];
          }
        }
        this.g.setNode(nodeId, nodeProperties, node.Event_Id);
      });

      // Add node styles
      this.g.nodes().forEach((v: any): void => {
        const node = this.g.node(v);
        node.rx = node.ry = 5;
        node.style = 'fill: #fff; stroke: #000; stroke-width: 2px; user-select:none; cursor: pointer';
        node.labelStyle = 'font-size: 2.3em';
      });

      // Populate the map
      this.nodes.forEach((node: any) => {
        this.nodeNameMap[node.id] = node.ActivityName || `Node ${node.id}`;
      });

      const uniqueEdgeWeight: Set<any> = new Set<any>();

      this.edges.forEach((edge: any): void => {
        if (edge != null && edge.weight != null) {
          uniqueEdgeWeight.add(edge.weight);
        }
      });

      const sortedWeightArray = Array.from(uniqueEdgeWeight).sort((a, b) => a - b);

      this.weightScale = d3
        .scaleLinear()
        .domain([sortedWeightArray[0], sortedWeightArray[sortedWeightArray.length - 1]])
        .range([2, 5]);

      // Add edges
      this.edges.forEach((edge: any): void => {
        if (edge.label && edge.source.id && edge.target.id) {
          const color: string = this.relationLabelColors.get(edge.label) || '#3f51b5';
          const strokeWidth: number = this.weightScale(edge.weight);

          this.g.setEdge(
            `${edge.source.id}`,
            `${edge.target.id}`,
            {
              weight: edge.weight,
              label: `${edge.label}` + `: ${edge.weight}`,
              style: `stroke: ${color}; stroke-width: ${strokeWidth}px; fill: rgba(219, 219, 219, 0);`,
              arrowheadStyle: `fill: ${color} ;`,
              curve: d3.curveBasis,
              labelpos: 'c', // label position to center
              labeloffset: 5,
              extensible: true,
              labelStyle: 'font-size: 2.3em'
            },
            edge.label
          );
        }
      });

      this.isLoadingNewNodes = false;
      this.cdt.detectChanges();
      // Configure the SVG
      const svg = d3
        .select(graphContainer.nativeElement)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

      const svgGroup = svg.append('g');

      // Render the graph
      const render: dagreD3.Render = new dagreD3.render();
      render(svgGroup as any, this.g as any);

      const graphWidth = this.g.graph().width;
      const graphHeight = this.g.graph().height;
      const firstNodeId = this.nodes[0].id;
      const firstNode = this.g.node(firstNodeId);
      const firstNodeX = firstNode.x;
      const firstNodeY = firstNode.y;

      // Calcola l'offset per centrare il grafo
      const xCenterOffset = (width - graphWidth) / 2 - firstNodeX + width / 2;
      const yCenterOffset = (height - graphHeight) / 2 - firstNodeY + height / 2;

      // Trasla il gruppo per centrarlo orizzontalmente e verticalmente
      svgGroup.attr('transform', `translate(${xCenterOffset}, ${yCenterOffset})`);

      // Imposta l'altezza dell'SVG per includere un margine in basso
      svg.attr('height', this.g.graph().height + 40);

      // Inizializza lo zoom
      this.initializePanZoom(svg, svgGroup);

      // Add listener for nodes
      svgGroup
        .selectAll('g.node')
        .attr('id', (d: any) => d)
        .on('click', (event) => {
          const nodeId = event.currentTarget.getAttribute('id');
          if (nodeId) {
            this.selectNodeSearched(nodeId);
          } else {
            console.error('Node ID is null or undefined');
          }
        });

      this.displayedNodes = this.nodes.slice(0, this.itemsPerPage);
      this.displayedEdges = this.edges.slice(0, this.itemsPerPage);
    }
  }

  /**
   * This method allow to add unique  Node for EKG
   * @param uniqueNodes the array of nodes
   * @param node the unique node to add.
   */
  private addNode(uniqueNodes: Set<any>, node: any): void {
    let nodeExists = false;

    for (const existingNode of uniqueNodes) {
      if (JSON.stringify(existingNode) === JSON.stringify(node)) {
        nodeExists = true;
        break;
      }
    }

    if (!nodeExists) {
      const timestamp = node['Timestamp'];
      const date = new Date(timestamp);

      // Format the timestamp
      const formattedDate = date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      node['Timestamp'] = formattedDate;
      uniqueNodes.add(node);
    }
  }

  /**
   * Assign color for the edge
   * @param edges the array of updated edges
   */
  private assignRelationLabelColors(edges: any[]): void {
    edges.forEach((edge: any) => {
      const label = edge.label;

      if (!this.relationLabelColors.has(label)) {
        const colorIndex = this.relationLabelColors.size % this.predefinedColors.length;
        const color = this.predefinedColors[colorIndex];
        this.relationLabelColors.set(label, color);
        this.allRelationships.push({ name: label, selected: true });
      }
    });
  }

  /**
   * Initialize the zoom
   * @param svg the svg
   * @param svgGroup the svgGroup
   */
  private initializePanZoom(svg: any, svgGroup: any): void {
    this.svg = svg;
    if (!svgGroup) {
      console.error('svgGroup is not defined!');
      return;
    }

    const zoomBehavior = d3.zoom().on('zoom', (event: any) => {
      if (event && event.transform) {
        const translateX = event.transform.x;
        const translateY = event.transform.y;
        const scale = event.transform.k;

        // Apply the zoom
        svgGroup.attr('transform', `translate(${translateX}, ${translateY}) scale(${scale})`);
      } else {
        console.error('Zoom event or transform is undefined');
      }
    });

    this.zoom = zoomBehavior;
    svg.call(zoomBehavior);

    if (this.supportService.graphType == GraphType.Filtered) {
      this.showWarningAnalysisModal();
    }
  }

  /**
   * Open the master sidebar
   */
  public openMasterSidebar(): void {
    const sidebarId = 'master-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Create the sidebar title
    let title = '';

    switch (this.supportService.graphType) {
      case GraphType.Standard:
        title = 'Manage Graph';
        break;
      case GraphType.Aggregate:
        title = 'Manage Aggregate Graph';
        break;
      case GraphType.Filtered:
        title = 'Manage Analysis';
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '500px',
        backgroundColor: '#fff',
        title: title,
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.masterSidebarTemplate,
      sidebarId
    );
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
            this.entityList.push(new EntityObjectList(item, 0));
          });

          this.retrieveNaNEntity();
        } else {
          this.logger.error('Unable to load the entities key of the Dataset', response.message);
          this.toast.show('Unable to load the entities key of the Dataset. Retry', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to load the entities key of the Dataset', errorData.message);
        this.toast.show('Unable to load the entities key of the Dataset. Retry', ToastLevel.Error, 3000);
      }
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

          this.entityList.forEach((entity: EntityObjectList) => {
            nullEntities.forEach((item: any) => {
              if (item.property_name == entity.name) {
                entity.numberOfNanNodes = item.count_nodes;
              }
            });
          });
        } else {
          this.logger.error('Unable to load the NaN entities of the Dataset', response.message);
          this.toast.show('Unable to load the NaN entities of the Dataset. Retry', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to load the NaN entities of the Dataset', errorData.message);
        this.toast.show('Unable to load the NaN entities of the Dataset. Retry', ToastLevel.Error, 3000);
      }
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
        width: '500px',
        backgroundColor: '#f9f9f9',
        title: 'Group by class',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: [{ label: 'Build', action: () => this.deletePreviousClassGraph(), color: 'var(--primary-color)' }]
      },
      this.aggregateSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Get the entity tooltip label
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
   * Update the aggregation sidebar
   * @param addButtons if we want to add the footer buttons
   */
  public updateAggregateSidebar(addButtons: boolean): void {
    const sidebarId = 'aggregate-sidebar';

    // Update the sidebar configuration
    if (addButtons) {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [
          { label: 'Build', action: () => this.deletePreviousClassGraph(), color: 'var(--primary-color)' },
          { label: 'Restore', action: () => this.resetSelection(), color: '#6c757d' }
        ]
      });
    } else {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [{ label: 'Build', action: () => this.deletePreviousClassGraph(), color: 'var(--primary-color)' }]
      });
    }
  }

  /**
   * Delete the previous class graph
   */
  public deletePreviousClassGraph(): void {
    this.aggregateGraphService.deleteGraph().subscribe({
      next: (response) => {
        if (response.statusCode == 200) {
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
      this.aggregateGraphService.createClassGraph(formData, this.selectedEntities, this.currentDataset!.name).subscribe({
        next: (response) => {
          if (response.statusCode === 201 && response.responseData != null) {
            // Show the aggregated graph
            this.currentDataset = this.supportService.updateDatasetInfo(response.responseData);
            this.supportService.graphType = GraphType.Aggregate;
            this.isLoading = false;

            this.sidebarService.close('aggregate-sidebar');
            this.sidebarService.close('master-sidebar');

            // Reset all data and create the new graph
            this.resetSelection();
            this.clearActualGraphs();
            this.populateJsonContent();
            this.shouldShowArrowBack = false;
            setTimeout(() => {
              this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: true }).setGraph({
                rankdir: 'LR',
                nodesep: 25,
                multiedgesep: 10
              });
              this.nodes = [];
              this.edges = [];
              this.nodeNameMap = {};
              this.allRelationships = [];

              // Update the graph with new data
              setTimeout(() => {
                this.isLoadingNewNodes = true;
                this.getGraphDetails(200, true);
              }, 300);
            }, 1000);
          } else {
            this.isLoading = false;

            this.sidebarService.reOpen('master-sidebar');
            this.sidebarService.reOpen('aggregate-sidebar');

            this.logger.error('Error while creating Class Graph', response.message);
            this.toast.show('Error while creating Class Graph. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.isLoading = false;

          this.sidebarService.reOpen('master-sidebar');
          this.sidebarService.reOpen('aggregate-sidebar');

          this.logger.error('Error while creating Class Graph', errorData.message);
          this.toast.show('Error while creating Class Graph. Retry', ToastLevel.Error, 3000);
        }
      });
    } catch (error) {
      this.isLoading = false;
      this.sidebarService.reOpen('master-sidebar');
      this.sidebarService.reOpen('aggregate-sidebar');

      this.logger.error('Internal Server Error');
      this.toast.show(`Internal Server Error: ${error}`, ToastLevel.Error, 3000);
    }
  }

  /**
   * Handle the operation to the operation card
   * @param operation the operation
   */
  public onOperationSelected(operation: any): void {
    operation.action();
  }

  /**
   * Open the master sidebar
   */
  public openSearchSidebar(): void {
    const sidebarId = 'search-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '600px',
        backgroundColor: '#fff',
        title: 'Search Data',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.searchSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Open the graph manager sidebar
   */
  public openGraphManager(): void {
    const sidebarId = 'manage-graph-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '500px',
        backgroundColor: '#fff',
        title: 'Manage Graph',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.manageGraphSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Open the graph manager sidebar
   */
  public openJSONSidebar(): void {
    const sidebarId = 'json-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '500px',
        backgroundColor: '#fff',
        title: 'Export JSON',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.jsonSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Update the JSON sidebar content
   * @param addButtons if we want to include the footer buttons
   */
  public updateJSONSidebar(addButtons: boolean): void {
    const sidebarId = 'json-sidebar';

    if (addButtons) {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [
          { label: 'Download', action: () => this.downloadJsonSelected(), color: 'var(--primary-color)' },
          { label: 'Restore', action: () => this.resetJsonSelection(), color: '#6c757d' }
        ]
      });
    } else {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: []
      });
    }
  }

  /**
   * Scroll the nodes inside the Sidebar
   */
  public onScrollNodes(): void {
    if (this.isSearchingMode() || !this.scrollNodeContainer) {
      return;
    }

    const element = this.scrollNodeContainer.nativeElement;

    if (element.scrollTop + element.clientHeight >= element.scrollHeight * 0.9 && !this.loadingFewData) {
      if (this.currentPage * this.itemsPerPage >= this.nodes.length) {
        return;
      }

      this.loadingFewData = true;

      setTimeout(() => {
        this.currentPage++;
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = this.currentPage * this.itemsPerPage;
        const newNodes = this.nodes.slice(startIndex, endIndex);

        this.displayedNodes = [...this.displayedNodes, ...newNodes];

        this.loadingFewData = false;
      }, 500);
    }
  }

  /**
   * Get node name from id
   * @param id the id
   */
  public getNodeName(id: string): string {
    return this.nodeNameMap[id] || `Unknown Node (${id})`;
  }

  /**
   * Scroll the edges inside the Sidebar
   */
  public onScrollEdges(): void {
    if (this.isSearchingMode() || !this.scrollEdgesContainer) {
      return;
    }

    const element = this.scrollEdgesContainer.nativeElement;

    if (element.scrollTop + element.clientHeight >= element.scrollHeight * 0.9 && !this.loadingFewData) {
      if (this.currentPage * this.itemsPerPage >= this.edges.length) {
        return;
      }

      this.loadingFewData = true;

      setTimeout(() => {
        this.currentPage++;
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = this.currentPage * this.itemsPerPage;
        const newNodes = this.edges.slice(startIndex, endIndex);

        this.displayedEdges = [...this.displayedEdges, ...newNodes];

        this.loadingFewData = false;
      }, 500);
    }
  }

  /**
   * If the user is search data
   */
  private isSearchingMode(): boolean {
    return this.searchQuery != '' ? true : false;
  }

  /**
   * Filter nodes
   */
  public searchData(): void {
    this.isSearchMode = this.searchTerm.trim() !== '';

    if (this.isSearchMode) {
      if (this.currentTabIndex == 0) {
        // Nodes
        const filteredItems = this.filterNodes();
        this.displayedNodes = filteredItems ? [...filteredItems] : [];
      } else {
        // Edges
        const filteredItems = this.filterEdges();
        this.displayedEdges = filteredItems ? [...filteredItems] : [];
      }
    } else {
      if (this.currentTabIndex == 0) {
        this.resetScrollNodeState();
      } else {
        this.resetScrollEdgeState();
      }
    }
  }

  /**
   * Reset scroll state for nodes
   */
  private resetScrollNodeState(): void {
    if (this.scrollNodeContainer) {
      const element = this.scrollNodeContainer.nativeElement;
      element.scrollTop = 0;
    }
  }

  /**
   * Reset scroll state for edges
   */
  private resetScrollEdgeState(): void {
    if (this.scrollEdgesContainer) {
      const element = this.scrollEdgesContainer.nativeElement;
      element.scrollTop = 0;
    }
  }

  /**
   * Hover to specific edge
   * @param item the edge
   */
  public hoverEdge(item: any): void {
    setTimeout(() => {}, 500);
    if (item != null && item.source.id != null && item.target.id != null) {
      const nodeSource = this.g.node(item.source.id);
      const nodeTarget = this.g.node(item.target.id);

      // Change node style
      if (nodeSource && nodeTarget) {
        const style = 'fill: #ffac1c; stroke: #faa614; stroke-width: 2px; cursor:pointer;';
        nodeSource.style = style;
        nodeTarget.style = style;

        // Renderer
        const render = new dagreD3.render();
        render(this.svg, this.g);
      }
    }
  }

  /**
   * Leave the hover to specific edge
   * @param item the edge
   */
  public leaveHoverEdge(item: any): void {
    if (item != null && item.source.id != null && item.target.id != null) {
      const nodeSource = this.g.node(item.source.id);
      const nodeTarget = this.g.node(item.target.id);

      if (nodeSource && nodeTarget) {
        const style = 'fill: #fff; stroke: #000; stroke-width: 2px';
        nodeSource.style = style;
        nodeTarget.style = style;

        // Renderer
        const render = new dagreD3.render();
        render(this.svg, this.g);
      }
    }
  }

  /**
   * Select class node
   * @param searched the searched node
   */
  public selectNodeSearched(searched: any): void {
    if (this.selectedNode && (this.selectedNode.id === searched.id || this.selectedNode.id == searched)) {
      this.closeNodeSearched();
      return;
    }

    let node = this.g.node(searched);

    if (searched.id != null) {
      node = this.g.node(searched.id);
    }

    if (node) {
      this.selectedResult = searched;
      this.selectedNode = node;
      node.style = 'fill: #ffac1c; stroke: #faa614; stroke-width: 2px; cursor:pointer;';

      // Node properties
      this.nodes.forEach((nodeStandard: any) => {
        if (this.selectedNode.id != null && this.selectedNode.id == nodeStandard.id) {
          this.propertiesSelectedNode = Object.entries(nodeStandard);
          this.isShowCardProperties = true;
        }
      });

      // Renderer
      const render = new dagreD3.render();
      render(this.svg, this.g);
    }
  }

  /**
   * Handle the click for close the Card properties
   */
  public closeCardProperties(): void {
    this.isShowCardProperties = false;

    this.closeNodeSearched();
  }

  /**
   * Handle the click for close the node searched
   */
  public closeNodeSearched(): void {
    if (this.selectedNode) {
      this.selectedNode.style = 'fill: #fff; stroke: #000; stroke-width: 2px';

      // Renderer
      const render = new dagreD3.render();
      render(this.svg, this.g);

      this.selectedNode = null;
      this.selectedResult = null;
      this.propertiesSelectedNode = null;
      this.isShowCardProperties = false;
    }
  }

  /**
   * Change the tab
   */
  public onTabChange(event: any): void {
    this.currentTabIndex = event.index;
    this.currentPage = 1;
    this.isSearchMode = false;
    this.searchTerm = '';
    this.displayedNodes = this.nodes.slice(0, this.itemsPerPage);
    this.displayedEdges = this.edges.slice(0, this.itemsPerPage);
  }

  /**
   * Filter nodes by the search term
   */
  public filterNodes(): any[] {
    const standardNodeFiltered = new Set<any>();

    if (!this.searchTerm) {
      return this.displayedNodes;
    }

    this.nodes.forEach((item: any) => {
      for (const key in item) {
        if (item[key] && item[key].toString().toLowerCase().includes(this.searchTerm.toLowerCase())) {
          standardNodeFiltered.add(item); // add node to set
          break;
        }
      }
    });

    return Array.from(standardNodeFiltered);
  }

  /**
   * Filter edges by the search term
   */
  public filterEdges(): any[] {
    const standardEdgeFiltered = new Set<any>();

    if (!this.searchTerm) {
      return this.displayedEdges;
    }

    this.edges.forEach((item: any) => {
      for (const key in item) {
        if (item[key] && item[key].toString().toLowerCase().includes(this.searchTerm.toLowerCase())) {
          standardEdgeFiltered.add(item);
          break;
        }
      }
    });

    return Array.from(standardEdgeFiltered);
  }

  /**
   * Close the search sidebar
   */
  public closeSearchSidebar(): void {
    this.sidebarService.close('search-sidebar');
    this.selectedNode = null;

    // Reset paginator
    this.currentPage = 1;
    this.displayedNodes = this.nodes.slice(0, this.itemsPerPage);
    this.displayedEdges = this.edges.slice(0, this.itemsPerPage);

    // Reset scroll state
    this.resetScrollNodeState();
    this.resetScrollEdgeState();
  }

  /**
   * Handle the slider event
   * @param event the event
   */
  public onSliderValueChanged(event: any): void {
    this.totalUniqueNodeShowed = event;

    if (this.totalUniqueNodeShowed !== this.totalUniqueNodeShowedBak) {
      this.updateManageSidebar(true);
    } else {
      this.updateManageSidebar(false);
    }
  }

  /**
   * Change the node view type
   * @param event the new type
   */
  public onChangeNodeView(event: any): void {
    this.nodeViewType = event;

    this.g.nodes().forEach((v: any): void => {
      const node = this.g.node(v);
      node.rx = node.ry = 5;
      if (this.nodeViewType == 'Circular') {
        node.shape = 'circle';
      } else {
        node.shape = 'rect';
      }
    });

    const render = new dagreD3.render();
    render(this.svg, this.g);
  }

  /**
   * Change relationships view
   * @param relationship the relationship
   * @param event the event
   */
  public onChangeRelationshipsView(relationship: { name: string; selected: boolean }, event: any): void {
    if (event == false) {
      this.g.edges().forEach((e: any): void => {
        if (e.name == relationship.name) {
          this.g.removeEdge(e);
        }
      });
    } else {
      this.edges.forEach((edge: any): void => {
        if (edge.label && edge.source.id && edge.target.id && edge.label == relationship.name) {
          const color: string = this.relationLabelColors.get(edge.label) || '#3f51b5';
          const strokeWidth: number = this.weightScale(edge.weight);

          this.g.setEdge(
            `${edge.source.id}`,
            `${edge.target.id}`,
            {
              label: `${edge.label}` + `: ${edge.weight}`,
              style: `stroke: ${color}; stroke-width: ${strokeWidth}px; fill: rgba(219, 219, 219, 0);`,
              arrowheadStyle: `fill: ${color} ;`,
              curve: d3.curveBasis,
              labelpos: 'c',
              labeloffset: 5,
              extensible: true
            },
            edge.label
          );
        }
      });
    }

    const render = new dagreD3.render();
    render(this.svg, this.g);
  }

  /**
   * Update the JSON sidebar content
   * @param addButtons if we want to include the footer buttons
   */
  public updateManageSidebar(addButtons: boolean): void {
    const sidebarId = 'manage-graph-sidebar';

    if (addButtons) {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [
          { label: 'Apply', action: () => this.updateNodeShowed(), color: 'var(--primary-color)' },
          { label: 'Restore', action: () => this.resetNodeShowed(), color: '#6c757d' }
        ]
      });
    } else {
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: []
      });
    }
  }

  /**
   * Update the graph with new nodes
   */
  public updateNodeShowed(): void {
    // Update and close sidebar
    this.updateManageSidebar(false);
    this.sidebarService.close('manage-graph-sidebar');
    this.sidebarService.close('master-sidebar');

    this.clearActualGraphs();

    // Reset all data and create the new graph
    setTimeout(() => {
      this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: true }).setGraph({ rankdir: 'LR', nodesep: 25, multiedgesep: 10 });
      this.nodes = [];
      this.edges = [];
      this.nodeNameMap = {};
      this.allRelationships = [];

      // Update the graph with new data
      setTimeout(() => {
        this.isLoadingNewNodes = true;
        this.getGraphDetails(this.totalUniqueNodeShowed, false);
      }, 300);
    }, 1000);
  }

  /**
   * Reset the actual graphs
   */
  public clearActualGraphs(): void {
    // Clear the graph
    this.clearGraphSVG();

    // Remove the nodes and edges
    this.g.nodes().forEach((n: any) => {
      this.g.removeNode(n);
    });

    this.g.edges().forEach((e: any) => {
      this.g.removeEdge(e);
    });

    // Render the view
    setTimeout(() => {
      const render = new dagreD3.render();
      render(this.svg, this.g);
    }, 600);
  }

  /**
   * Clear the svg content and inner html
   */
  private clearGraphSVG(): void {
    const container = document.getElementById('myGraphContainer');

    // Check the container and apply updates
    if (container) {
      container.innerHTML = '';

      // Set the svg
      const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgElement.setAttribute('id', 'graphSvg');
      svgElement.classList.add('graph-svg');
      svgElement.style.width = '100%';
      svgElement.style.height = '85vh';

      container.appendChild(svgElement);
      this.graphContainer.nativeElement = svgElement;
    }
  }

  /**
   * Restore the unique node showed to the original
   */
  private resetNodeShowed(): void {
    this.updateManageSidebar(false);
    this.totalUniqueNodeShowed = this.totalUniqueNodeShowedBak;
  }

  /**
   * Open the modal for calculate the frequency
   */
  public openFrequencyModal(): void {
    // Clear the oldest frequency
    this.frequencyResults = [];

    // Show the generic modal
    this.modalService.showGenericModal(
      'Frequency Calculation',
      'Please enter the frequency value that you would like to calculate for the given dataset. This will help determine how often specific events or activities occur in the dataset. Make sure the frequency is relevant to your analysis.',
      true,
      true,
      'Frequency',
      'Calculate',
      'var(--primary-color)',
      'Cancel',
      '#555',
      () => {},
      (frequency: any) => {
        // Handle input frequency
        return this.preCalculateFrequency(frequency);
      },
      () => {
        // Secondary button action
        this.modalService.hideDeleteDatasetModal();
      }
    );
  }

  /**
   * Catch and calculate the frequency and then resolve the promise
   * @param frequency the frequency
   */
  private preCalculateFrequency(frequency: any) {
    if (frequency != null && frequency > 0) {
      this.analysisService.calculateFrequencyFilter(frequency).subscribe({
        next: (response) => {
          if (response.statusCode == 200 && response.responseData != null) {
            const data = response.responseData;

            // Add frequency results
            data.forEach((item: any) => {
              const freq = new FrequencyFilter();
              freq.activity = item.activity;
              freq.frequency = item.frequency;

              this.frequencyResults.push(freq);
            });

            if (this.frequencyResults.length > 0) {
              this.openFrequencySidebar();
            } else {
              this.toast.show('No content for this frequency', ToastLevel.Warning, 3000);
            }
          } else if (response.statusCode == 204) {
            this.toast.show('No content for this frequency', ToastLevel.Warning, 3000);
          } else {
            this.logger.error('Error while calculate the frequency', response.message);
            this.toast.show('Error while calculate the frequency. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.logger.error('Error while calculate the frequency', errorData.message);
          this.toast.show('Error while calculate the frequency. Retry', ToastLevel.Error, 3000);
        }
      });
    }

    return Promise.resolve();
  }

  /**
   * Open the sidebar for show the frequency result
   */
  private openFrequencySidebar(): void {
    const sidebarId = 'frequency-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '500px',
        backgroundColor: '#fff',
        title: this.frequencyResults.length + ' ' + 'Frequency Result',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.frequencySidebarTemplate,
      sidebarId
    );
  }

  /**
   * Calculate the variation
   */
  private calculateGraphVariation(): void {
    // Add the loading status
    this.updateCalculateVariationOperation(true);
    this.variationResults = [];

    this.analysisService.calculateVariationFilter().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;

          data.forEach((item: any) => {
            const variation = new VariationFilter();
            variation.activities = item.activities;
            variation.distinctActivities = item.distinct_activities;
            variation.avgDuration = item.avg_duration;
            variation.frequency = item.frequency;

            this.variationResults.push(variation);
          });

          // Remove the loading status
          this.updateCalculateVariationOperation(false);

          if (this.variationResults.length > 0) {
            this.openVariationSidebar();
          } else {
            // Remove the loading status
            this.updateCalculateVariationOperation(false);
            this.toast.show('No content for the variation', ToastLevel.Warning, 3000);
          }
        } else if (response.statusCode == 204) {
          // Remove the loading status
          this.updateCalculateVariationOperation(false);
          this.toast.show('No content for the variation', ToastLevel.Warning, 3000);
        } else {
          // Remove the loading status
          this.updateCalculateVariationOperation(false);

          this.logger.error('Error while calculate the variation', response.message);
          this.toast.show('Error while calculate the variation. Retry', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        // Remove the loading status
        this.updateCalculateVariationOperation(false);

        this.logger.error('Error while calculate the variation', errorData.message);
        this.toast.show('Error while calculate the variation. Retry', ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Open the sidebar for show the variation result
   */
  private openVariationSidebar(): void {
    const sidebarId = 'variation-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '500px',
        backgroundColor: '#fff',
        title: 'Variation Result',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      this.variationSidebarTemplate,
      sidebarId
    );
  }

  /**
   * Calculate timestamp duration by seconds
   * @param duration the seconds
   * @returns a formatted string
   */
  public convertVariationTimeDuraiton(duration: number): string {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;

    let result = '';
    if (hours > 0) {
      result += `${hours} hr `;
    }
    if (minutes > 0 || hours > 0) {
      // Include minutes only if there are hours or minutes
      result += `${minutes} min `;
    }
    result += `${seconds} sec`;

    return result.trim();
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

    if (this.selectedJson.length > 0) {
      this.updateJSONSidebar(true);
    } else {
      this.updateJSONSidebar(false);
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

    this.updateJSONSidebar(false);
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
        case 'CORR relationships':
          requests.push({ name: 'CORR relationships', observable: this.jsonDataService.corrLinkJSON() });
          break;
        case 'DF relationships':
          requests.push({ name: 'DF relationships', observable: this.jsonDataService.dfLinkJSON() });
          break;
        case 'Class nodes':
          requests.push({ name: 'Class nodes', observable: this.jsonDataService.classNodeJSON() });
          break;
        case 'OBS relationships':
          requests.push({ name: 'CORR relationships', observable: this.jsonDataService.corrLinkJSON() });
          break;
        case 'DF_C relationships':
          requests.push({ name: 'CORR relationships', observable: this.jsonDataService.corrLinkJSON() });
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
          this.sidebarService.close('json-sidebar');
          this.resetJsonSelection();

          this.toast.show('Json files downloaded successfully', ToastLevel.Success, 3000);
        },
        error: (errorData: ApiResponse<any>) => {
          this.logger.error('Error while downloading json content', errorData.message);
          this.toast.show('Error while downloading json content. Retry', ToastLevel.Error, 3000);
        }
      });
  }

  /**
   * Export the SVG
   */
  public exportSvg(): void {
    const svgElement = document.querySelector('#myGraphContainer svg');

    if (svgElement && this.currentDataset) {
      const svgContent = svgElement.outerHTML;

      // Save to the browser
      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
      saveAs(svgBlob, 'graph.svg');

      // Save to the backend as a preview
      if (this.currentDataset!.svg == null) {
        this.standardGraphService.sendSVG(svgContent, this.currentDataset.name).subscribe({
          next: () => {},
          error: () => {}
        });
      }
    }
  }

  /**
   * Leave the graph page
   */
  public leavePage(): void {
    this.router.navigate(['datasets', this.currentDataset!.name]);
  }

  /**
   * Open the modal for delete dataset
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
   * Open the modal for delete the analysis
   */
  public openModalDeleteAnalysis(): void {
    if (this.currentDataset != null) {
      const title = 'Delete' + ' ' + this.analysisName + ' ' + 'analysis?';

      this.modalService.showDeleteDatasetModal(
        title,
        'Are you sure you want to delete this Analysis? This operation is not reversible',
        this.analysisName,
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
   * @param name the dataset name
   */
  public preDeleteDataset(name: string): Promise<void> {
    if (name !== null && name != '') {
      this.deleteDataset();
    }

    return Promise.resolve();
  }

  /**
   * Catch the promise and data from modal
   * @param name the analysis name
   */
  public preDeleteAnalysis(name: string): Promise<void> {
    if (name !== null && name != '') {
      this.deleteAnalysis();
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
            this.deleteMemgraphData(true);
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
   * Delete the analysis
   */
  private deleteAnalysis(): void {
    if (this.currentDataset != null) {
      this.analysisService.deleteAnalysis(this.currentDataset!.name, this.analysisName).subscribe({
        next: (response) => {
          if (response.statusCode == 200 || response.statusCode == 202) {
            // Now we can remove the Memgraph data
            this.deleteMemgraphData(false);
          } else {
            this.logger.error('Unable to delete the Analysis', response.message);
            this.toast.show('Unable to delete the Dataset. Please retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.logger.error('Unable to delete the Analysis', errorData.message);
          this.toast.show('Unable to delete the Analysis. Please retry', ToastLevel.Error, 3000);
        }
      });
    }
  }

  /**
   * Remove the current content inside memgraph database
   */
  private deleteMemgraphData(returnHome: boolean): void {
    this.standardGraphService.deleteGraph().subscribe({
      next: (response) => {
        if (response.statusCode == 200) {
          this.toast.show('Dataset deleted successfully', ToastLevel.Success, 3000);
          this.supportService.removeCurrentDataset();

          if (returnHome) {
            this.router.navigate(['/welcome']);
          } else {
            this.router.navigate(['/datasets']);
          }
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
   * Remove the current aggregate graph inside
   * Memgraph database
   */
  private deleteAggregateGraph(): void {
    this.aggregateGraphService.deleteGraph().subscribe({
      next: (response) => {
        if (response.statusCode == 200) {
          // Restore some data
          const dataset = this.currentDataset;
          this.currentDataset = this.supportService.resetDatasetInfo(dataset);
          this.supportService.setCurrentDataset(this.currentDataset);
          this.toast.show('Aggregate graph deleted successfully', ToastLevel.Success, 3000);
          this.leavePage();
        } else {
          this.logger.error('Unable to delete aggregate graph', response.message);
          this.toast.show('Unable to delete the aggregate graph. Please retry', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to delete aggregate graph', errorData.message);
        this.toast.show('Unable to delete the aggregate graph. Please retry', ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Add the json object
   */
  private populateJsonContent(): void {
    this.jsonList = [];
    if (this.supportService.graphType === GraphType.Aggregate) {
      this.jsonList.push(new JsonObject('Class nodes', false));
      this.jsonList.push(new JsonObject('OBS relationships', false));
      this.jsonList.push(new JsonObject('DFC relationships', false));
    } else {
      this.jsonList.push(new JsonObject('Event nodes', false));
      this.jsonList.push(new JsonObject('Entity nodes', false));
      this.jsonList.push(new JsonObject('CORR relationships', false));
      this.jsonList.push(new JsonObject('DF relationships', false));
    }
  }

  /**
   * Update the operation sidebar with some content
   */
  private updateOperations(): void {
    if (this.supportService.graphType !== GraphType.Filtered) {
      if (this.supportService.graphType === GraphType.Aggregate) {
        this.operations.push({
          title: 'Delete Aggregation',
          description: 'This operation is not reversible',
          icon: 'delete_forever',
          loading: false,
          action: () => this.deleteAggregateGraph()
        });
      } else {
        const manageGraphViewIndex = this.operations.findIndex((op) => op.title === 'Manage Graph View');

        // Add the operations
        if (manageGraphViewIndex !== -1) {
          this.operations.splice(
            manageGraphViewIndex + 1,
            0,
            {
              title: 'Calculate Frequency',
              description: 'Calculate the frequency based on the full Dataset data',
              icon: 'analytics',
              loading: false,
              action: () => this.openFrequencyModal()
            },
            {
              title: 'Calculate Variation',
              description: 'Calculate the variation based on the full Dataset data',
              icon: 'analytics',
              loading: false,
              action: () => this.calculateGraphVariation()
            }
          );
        }

        this.operations.push({
          title: 'Delete Dataset',
          description: 'This operation is not reversible',
          icon: 'delete_forever',
          loading: false,
          action: () => this.openModalDeleteDataset()
        });
      }
    } else {
      // Load the entity key
      this.loadEntityKey();

      const aggregateOperation = {
        title: 'Aggregate Graph',
        description: 'Aggregate graph by grouping nodes into chosen classes',
        icon: 'group_work',
        loading: false,
        action: () => this.openAggregateSidebar()
      };

      const manageDatasetsOperation = {
        title: 'Manage Datasets',
        description: 'View all datasets',
        icon: 'dashboard',
        loading: false,
        action: () => this.goToDatasetsPage()
      };

      const deleteAnalysisOperation = {
        title: 'Delete Analysis',
        description: 'This operation is not reversible',
        icon: 'delete_forever',
        loading: false,
        action: () => this.openModalDeleteAnalysis()
      };

      // Update the operations positions
      const originalOperations = [...this.operations];
      this.operations = [];
      if (originalOperations.length > 0) {
        this.operations.push(originalOperations[0]);
      }

      this.operations.push(aggregateOperation);

      if (originalOperations.length > 1) {
        this.operations.push(...originalOperations.slice(1));
      }

      this.operations.push(manageDatasetsOperation);
      if (this.analysisName != '') {
        this.operations.push(deleteAnalysisOperation);
      }
    }
  }

  /**
   * Update the calculate variation sider operation
   * @param add if we want to add the loading or not
   */
  public updateCalculateVariationOperation(add: boolean): void {
    const calculateVariationIndex = this.operations.findIndex((op) => op.title === 'Calculate Variation');

    if (calculateVariationIndex !== -1) {
      // Change the loading attribute
      this.operations[calculateVariationIndex] = {
        ...this.operations[calculateVariationIndex],
        loading: add
      };
    }
  }

  /**
   * Show modal for warning message
   */
  private showWarningAnalysisModal(): void {
    this.modalService.showGenericModal(
      'Warning',
      'Filters applied successfully. Data in Memgraph is updated. To reload the original dataset, please reopen it from the dedicated page',
      false,
      false,
      '',
      'Done',
      'var(--primary-color)',
      '',
      '',
      () => {},
      () => {
        return Promise.resolve();
      },
      () => {}
    );
  }

  /**
   * Get max data to show
   */
  private getMaxDataToShow(): void {
    let request = this.supportService.graphType;

    if (this.supportService.graphType == 3) {
      request = GraphType.Standard;
    }

    this.genericGraphService.getMaxDataGraphToShow(request).subscribe({
      next: (response) => {
        if (response != null && response.statusCode === 200 && response.responseData != null) {
          const data = response.responseData;
          this.maxDataToShow = data;

          if (this.maxDataToShow < 200) {
            this.totalUniqueNodeShowed = data;
          } else {
            this.totalUniqueNodeShowed = 200;
          }
        } else {
          this.logger.error('Unable to load the max data to show', response.message);
          this.toast.show('Unable to load the max data to show. Retry', ToastLevel.Error, 3000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.logger.error('Unable to load the max data to show', errorData.message);
        this.toast.show('Unable to load the max data to show. Retry', ToastLevel.Error, 3000);
      }
    });
  }

  /**
   * Go to de Datasets page
   */
  private goToDatasetsPage(): void {
    this.router.navigate(['datasets']);
  }
}
