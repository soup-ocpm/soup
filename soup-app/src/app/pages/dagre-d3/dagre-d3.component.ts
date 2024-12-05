import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';

import { SDividerComponent } from '../../core/components/s-divider/s-divider.component';
import { ToastLevel } from '../../core/enums/toast_type.enum';
import { LoggerService } from '../../core/services/logger.service';
import { NotificationService } from '../../core/services/toast.service';
import { Dataset } from '../../models/dataset.model';
import { GenericGraphService } from '../../services/generic_graph.service';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

@Component({
  selector: 'app-dagre-d3',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, SDividerComponent],
  templateUrl: './dagre-d3.component.html',
  styleUrl: './dagre-d3.component.scss'
})
export class DagreD3Component implements OnInit, AfterViewInit {
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

  // Search string by User for search nodes or links
  public searchQuery = '';

  // Searched results (nodes or links)
  public searchResults: any[] = [];

  // Result about the search or not
  public researched: boolean | undefined;

  // If the user search node or links
  public isSearchMode = false;

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

  // Selected researched Node
  public selectedNode: any;

  // Selected result for searched Node
  public selectedResult: any;

  // Properties of the researched Node
  public propertiesSelectedNode: any = [];

  // If the card for node properties is show or not
  public isShowCardProperties: boolean | undefined;

  // If the user watch the search sidebar
  public isShowSearchSidebar = false;

  // Map for track colors for Edges
  public relationLabelColors: Map<string, string> = new Map<string, string>();

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

  // If the user come to view the standard graph or class
  public isViewStandardGraph = true;

  // The search
  public searchTerm = '';

  // If the menu sidebar is open or not
  public isOpenMenuSidebar = false;

  // If the search sidebar is open or not
  public isOpenSearchSidebar = false;

  // The loading state
  public isLoading = false;

  /**
   * Constructor for DagreD3Component component
   * @param router the Router
   * @param toast the NotificationService service
   * @param activatedRoute the ActivatedRoute
   * @param loggerService the LoggerService service
   * @param genericGraphService the GenericGraphService service
   * @param supportService the SupportService service
   */
  constructor(
    private router: Router,
    private toast: NotificationService,
    private activatedRoute: ActivatedRoute,
    private loggerService: LoggerService,
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
    this.g = new dagreD3.graphlib.Graph().setGraph({ rankdir: 'LR' });
    this.createGraphVisualization(this.graphContainer, 'myGraphContainer');
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
        this.loggerService.error(apiResponse);
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

      this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: true }).setGraph({ rankdir: 'LR', nodesep: 25, multiedgesep: 10 });

      this.nodes.forEach((node: any): void => {
        const nodeId = node['id'];
        const nodeName = node['ActivityName'];
        const nodeProperties: any = {
          label: nodeName
        };

        for (const prop in node) {
          if (Object.prototype.hasOwnProperty.call(node, prop)) {
            nodeProperties[prop] = node[prop];
          }
        }
        this.g.setNode(nodeId, nodeProperties, node['Event_Id']);
      });

      this.g.nodes().forEach((v: any): void => {
        const node = this.g.node(v);
        node.rx = node.ry = 5;
        node.style = 'fill: #fff; stroke: #000; stroke-width: 2px; cursor: pointer';
      });

      this.edges.forEach((edge: any): void => {
        if (edge.label && edge.source.id && edge.target.id) {
          const color: string = this.relationLabelColors.get(edge.label) || '#3f51b5';
          this.g.setEdge(
            `${edge.source.id}`,
            `${edge.target.id}`,
            {
              weight: edge.weight,
              label: `${edge.label}` + `: ${edge.weight}`,
              style: `stroke: ${color}; fill: rgba(219, 219, 219, 0);`,
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

      // Create the render for the SVG
      const render: dagreD3.Render = new dagreD3.render();

      // Set up an SVG group to render the graph
      const svg = d3
        .select(graphContainer.nativeElement)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

      const svgGroup = svg.append('g');

      // Inizializza lo zoom
      this.initializePanZoom(svg, svgGroup);

      // Render del grafo
      render(svgGroup as any, this.g as any);

      svgGroup.selectAll('g.node').on('click', (event) => {
        const nodeId = event.currentTarget.getAttribute('id');
        this.selectNode(nodeId);
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
   * If the user is search data
   */
  private isSearchingMode(): boolean {
    return this.searchQuery != '' ? true : false;
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

  // Metodo per resettare lo stato di scroll
  private resetScrollNodeState(): void {
    if (this.scrollNodeContainer) {
      const element = this.scrollNodeContainer.nativeElement;
      element.scrollTop = 0; // Imposta la posizione dello scroll all'inizio
    }
  }

  // Metodo per resettare lo stato di scroll
  private resetScrollEdgeState(): void {
    if (this.scrollEdgesContainer) {
      const element = this.scrollEdgesContainer.nativeElement;
      element.scrollTop = 0; // Imposta la posizione dello scroll all'inizio
    }
  }

  /**
   * Select specific node
   * @param nodeId the node id
   */
  public selectNode(nodeId: string): void {
    const nodeElement = d3.select(`g.node[id="${nodeId}"]`).node() as SVGGraphicsElement;

    if (!nodeElement) {
      return;
    }

    const node = this.g.node(nodeId);

    this.nodes.forEach((currentNode: any) => {
      if (currentNode['EventID'] == node['EventID']) {
        console.log('Sono dentro ');
      }
    });
  }

  /**
   * Search inside the EKG
   */
  public graphSearch(): void {
    this.searchResults = this.nodes.filter((node: any) => {
      for (const key in node) {
        if (node[key] && node[key].toString().toLowerCase().includes(this.searchQuery.toLowerCase())) {
          return true;
        }
      }

      for (const edge of this.edges) {
        for (const key in edge) {
          if (edge[key] && edge[key].toString().toLowerCase().includes(this.searchQuery.toLowerCase())) {
            return true;
          }
        }
      }
      return false;
    });
    this.researched = true;
  }

  /**
   * Select class node
   * @param searched the searched node
   */
  public selectNodeSearched(searched: any): void {
    if (this.selectedNode) {
      return;
    }

    const node = this.g.node(searched.id);

    if (node) {
      this.selectedResult = searched;

      this.selectedNode = node;
      const centerX = node.x;
      const centerY = node.y;

      node.style = 'fill: #8AC5FF; stroke: #488FEF; stroke-width: 2px';

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
   * Select class node
   * @param searched the searched node
   */
  public selecEdgeSearched(searched: any): void {
    if (this.selectedNode) {
      return;
    }

    const node = this.g.node(searched.id);

    if (node) {
      this.selectedResult = searched;

      this.selectedNode = node;
      const centerX = node.x;
      const centerY = node.y;

      node.style = 'fill: #8AC5FF; stroke: #488FEF; stroke-width: 2px';

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

  // Metodo che viene chiamato quando la tab cambia
  public onTabChange(event: any): void {
    this.currentTabIndex = event.index;
    this.currentPage = 1;
    this.isSearchMode = false;
    this.searchTerm = '';
    this.displayedNodes = this.nodes.slice(0, this.itemsPerPage);
    this.displayedEdges = this.edges.slice(0, this.itemsPerPage);
  }

  /**
   * Handle the click for close the Card properties
   */
  public closeCardProperties(): void {
    this.isShowCardProperties = false;
    this.closeNodeSearched();
  }

  /**
   * Handle the click for open Sidebar for search nodes
   */
  public toggleSidebarSearch(): void {
    this.isShowSearchSidebar = true;
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
   * Filter nodes by the search term
   */
  public filterNodes(): any[] {
    const standardNodeFiltered = new Set<any>(); // Utilizzo di Set per evitare duplicati

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

    return Array.from(standardNodeFiltered); // Converte il Set in un array
  }

  /**
   * Filter edges by the search term
   */
  public filterEdges(): any[] {
    const standardEdgeFiltered = new Set<any>(); // Utilizzo di Set per evitare duplicati

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
}
