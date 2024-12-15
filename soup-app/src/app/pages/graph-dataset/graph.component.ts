import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
import saveAs from 'file-saver';
import { concatMap, from, map, Observable, toArray } from 'rxjs';

import { SpBtnComponent, SpDividerComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { ModalService } from 'src/app/shared/components/s-modals/modal.service';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';
import { ApiResponse } from '../../core/models/api_response.model';
import { LoggerService } from '../../core/services/logger.service';
import { Dataset } from '../../models/dataset.model';
import { DatasetService } from '../../services/datasets.service';
import { GenericGraphService } from '../../services/generic_graph.service';
import { JSONDataService } from '../../services/json_data.service';
import { StandardGraphService } from '../../services/standard_graph.service';
import { ToastLevel } from '../../shared/components/s-toast/toast_type.enum';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';
import { JsonObject } from '../details-dataset/details-dataset.component';

@Component({
  selector: 'app-graph',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    // Component import
    SpBtnComponent,
    SpDividerComponent,
    SpSpinnerComponent
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

  // Loading nodes for scrollbar
  public loadingFewData = false;

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

  // If the user watch the search sidebar
  public isShowSearchSidebar = false;

  // If the user watch the manage graph sidebar
  public isShowManageGraphSidebar = false;

  // If the sidebar of JSON is open or not
  public isOpenJSONSidebar = false;

  // If the user attend download the json
  public isLoadingJsonDownload = false;

  // If the menu sidebar is open or not
  public isOpenMenuSidebar = false;

  // If the search sidebar is open or not
  public isOpenSearchSidebar = false;

  // The loading state
  public isLoading = false;

  // If the user come to view the standard graph or class
  public isViewStandardGraph = false;

  // The json object list
  public jsonList: JsonObject[] = [];

  // List of the selected json content
  public selectedJson: string[] = [];

  // ElementRef container to show SVG of the Graph.
  @ViewChild('graphSvg', { static: true }) graphContainer!: ElementRef;

  // ElementRef container for node list inside the Search sidebar
  @ViewChild('scrollNodeContainer') scrollNodeContainer!: ElementRef;

  // ElementRef container for edges list inside the Search sidebar
  @ViewChild('scrollEdgesContainer') scrollEdgesContainer!: ElementRef;

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
   * Constructor for
   * @param router
   * @param toast
   * @param activatedRoute
   * @param modalService
   * @param datasetService
   * @param jsonDataService
   * @param logService
   * @param genericGraphService
   * @param supportService
   */
  constructor(
    private router: Router,
    private toast: NotificationService,
    private activatedRoute: ActivatedRoute,
    private modalService: ModalService,
    private datasetService: DatasetService,
    private jsonDataService: JSONDataService,
    private logService: LoggerService,
    private standardGraphService: StandardGraphService,
    private genericGraphService: GenericGraphService,
    private supportService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit() {
    const datasetName = this.activatedRoute.snapshot.paramMap.get('name');
    this.currentDataset = this.supportService.getCurrentDataset();

    if (this.currentDataset != null && this.currentDataset.name == datasetName) {
      this.g = new dagreD3.graphlib.Graph().setGraph({ rankdir: 'LR' });
      this.isViewStandardGraph = this.supportService.viewStandardGraph;
      this.getGraphDetails();
    } else {
      this.toast.show('Unable to retrieve Graph. Retry', ToastLevel.Error, 3000);
      this.router.navigate(['/welcome']);
      return;
    }

    this.populateJsonContent();
    this.g = new dagreD3.graphlib.Graph().setGraph({ rankdir: 'LR' });
  }

  // NgAfterViewInit implementation
  public ngAfterViewInit() {
    this.scrollNodeContainer.nativeElement.addEventListener('scroll', () => {
      this.onScrollNodes();
    });

    this.scrollEdgesContainer.nativeElement.addEventListener('scroll', () => {
      this.onScrollEdges();
    });
  }

  /**
   * Get the graph details
   */
  private getGraphDetails(): void {
    const standardGraph = this.isViewStandardGraph ? '1' : '0';

    this.genericGraphService.getGraph(200, standardGraph).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          this.injectData(response.responseData);
        } else {
          this.isLoading = false;
          this.toast.show('Unable to retrieve Graph. Retry', ToastLevel.Error, 3000);
          this.router.navigate(['/datasets', this.currentDataset!.name]);
        }
      },
      error: (errorData) => {
        const apiResponse: any = errorData;
        this.logService.error(apiResponse);
        this.isLoading = false;
        this.toast.show('Unable to retrieve Graph. Retry', ToastLevel.Error, 3000);
        this.router.navigate(['/datasets', this.currentDataset!.name]);
      },
      complete: () => {}
    });
  }

  /**
   * Inject the data for prepare the EKG
   * @param data the data
   */
  private injectData(data: any): void {
    const uniqueNodes: Set<any> = new Set<any>();
    const uniqueDfRelationships: Set<any> = new Set<any>();

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

      const nodeTarget = item['node_target'];
      nodeTarget['label'] = nodeTarget['ActivityName'];

      // Aggiungi la logica per gestire più relazioni
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
      this.nodes.forEach((node: any) => {
        const nodeProperties = {
          label: node.ActivityName,
          Event_Id: node.Event_Id,
          someProperty: node.someProperty
        };
        this.g.setNode(node.id, nodeProperties);
      });

      // Add node styles
      this.g.nodes().forEach((v: any): void => {
        const node = this.g.node(v);
        node.rx = node.ry = 5;
        node.style = 'fill: #fff; stroke: #000; stroke-width: 2px; cursor: pointer'; // Aggiungi cursor: pointer per i nodi
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

      // Create renderer for d3
      const render: dagreD3.Render = new dagreD3.render();

      // Configure the SVG
      const svg = d3
        .select(graphContainer.nativeElement)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

      const svgGroup = svg.append('g');

      // Initialize the zoom
      this.initializePanZoom(svg, svgGroup);

      // Render the graph
      render(svgGroup as any, this.g as any);

      // Estrarre il contenuto dell'SVG come stringa
      const svgContent = svg.node().outerHTML;

      // Invio al backend tramite una POST
      if (this.currentDataset!.svg === null) {
        this.publishSVG(svgContent, this.currentDataset!.name);
      }

      // Add listener for nodes
      svgGroup
        .selectAll('g.node')
        .attr('id', (d: any) => d) // Assegna l'ID al nodo
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
  private addNode(uniqueNodes: Set<any>, node: any) {
    let nodeExists = false;

    for (const existingNode of uniqueNodes) {
      if (JSON.stringify(existingNode) === JSON.stringify(node)) {
        nodeExists = true;
        break;
      }
    }

    if (!nodeExists) {
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

    const zoomBehavior = d3.zoom().on('zoom', (event) => {
      if (event && event.transform) {
        this.currentZoomEvent = event;
        svgGroup.attr('transform', event.transform);
      } else {
        console.error('Zoom event or transform is undefined');
      }
    });

    this.zoom = zoomBehavior;
    svg.call(zoomBehavior); // Associa zoom allo svg
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
      element.scrollTop = 0; // Imposta la posizione dello scroll all'inizio
    }
  }

  /**
   * Reset scroll state for edges
   */
  private resetScrollEdgeState(): void {
    if (this.scrollEdgesContainer) {
      const element = this.scrollEdgesContainer.nativeElement;
      element.scrollTop = 0; // Imposta la posizione dello scroll all'inizio
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
      const centerX = node.x;
      const centerY = node.y;

      node.style = 'fill: #ffac1c;; stroke: #faa614; stroke-width: 2px; cursor:pointer; ';

      const zoomTransform = d3.zoomIdentity.translate(-centerX, -centerY).scale(2);
      this.svg.call(this.zoom.transform, zoomTransform);

      const render = new dagreD3.render();
      render(this.svg, this.g);

      this.nodes.forEach((nodeStandard: any) => {
        if (this.selectedNode.id != null && this.selectedNode.id == nodeStandard.id) {
          this.propertiesSelectedNode = Object.entries(nodeStandard);
          this.isShowCardProperties = true;
        }
      });
    }
  }

  /**
   * Select and highlight an edge
   * @param edgeId the ID of the edge to be highlighted
   */
  public selectEdgeSearched(edgeId: string): void {
    if (this.selectedEdge) {
      return;
    }

    // Trova l'arco in base all'ID
    const edge = this.g.edge(edgeId);

    if (edge) {
      this.selectedEdge = edge;

      // Imposta lo stile dell'arco selezionato
      edge.style = 'stroke: #FF6347; stroke-width: 3px;'; // Cambia il colore e lo spessore dell'arco

      // Trova i nodi associati a questo arco
      const sourceNode = this.g.node(edge.source);
      const targetNode = this.g.node(edge.target);

      // Calcola il centro dell'arco per centrare la visualizzazione
      const centerX = (sourceNode.x + targetNode.x) / 2;
      const centerY = (sourceNode.y + targetNode.y) / 2;

      // Zoom sulla parte centrale dell'arco
      const zoomTransform = d3.zoomIdentity.translate(-centerX, -centerY).scale(2);
      this.svg.call(this.zoom.transform, zoomTransform);

      // Rende di nuovo il grafo con il nuovo stato
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

      this.svg.call(this.zoom.transform, d3.zoomIdentity);

      const render = new dagreD3.render();
      render(this.svg, this.g);

      this.selectedNode = null;
      this.selectedResult = null;
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
          standardNodeFiltered.add(item); // Aggiunge il nodo al Set
          break; // Evita di continuare a controllare le altre chiavi una volta trovato un match
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
    this.isOpenSearchSidebar = false;
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
   * Open or close the JSON sidebar
   */
  public handleJSONSidebar(): void {
    this.isOpenJSONSidebar = !this.isOpenJSONSidebar;
  }

  /**
   * Export the SVG
   */
  public exportSvg(): void {
    const svgContent = document.querySelector('#myGraphContainer svg');
    if (svgContent != null) {
      const svgBlob = new Blob([svgContent.outerHTML], { type: 'image/svg+xml' });
      saveAs(svgBlob, 'graph.svg');
    }
  }

  /**
   * Open dialog for delete the class graph
   */
  public openDialogDelete(): void {}

  /**
   * Leave the graph page
   */
  public leavePage(): void {
    this.router.navigate(['datasets', this.currentDataset!.name]);
  }

  /**
   * handle the click for the menu icon
   */
  public handleMenuOperations(): void {
    this.isOpenMenuSidebar = true;
  }

  /**
   * Handle the click for the search icon
   */
  public handleSearchData(): void {
    this.isOpenSearchSidebar = true;
  }

  /**
   * Handle the click for manage graph sidebar
   */
  public handleGraphSidebarManager(): void {
    this.isShowManageGraphSidebar = true;
  }

  /**
   * Handle the click for delete EKG
   */
  public handleDeleteGraph(): void {
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
  private deleteDataset(): void {
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
   * Add the json object
   */
  private populateJsonContent(): void {
    if (!this.isViewStandardGraph) {
      this.jsonList.push(new JsonObject('Class nodes', false));
      this.jsonList.push(new JsonObject(':OBS links', false));
      this.jsonList.push(new JsonObject(':DFC links', false));
    } else {
      this.jsonList.push(new JsonObject('Event nodes', false));
      this.jsonList.push(new JsonObject('Entity nodes', false));
      this.jsonList.push(new JsonObject(':CORR links', false));
      this.jsonList.push(new JsonObject(':DF links', false));
    }
  }

  /**
   * Send the svg to the engine
   * @param svg the svg
   */
  private publishSVG(svg: string, datasetName: string): void {
    this.standardGraphService.sendSVG(svg, datasetName).subscribe({
      next: () => {},
      error: () => {},
      complete: () => {}
    });
  }
}
