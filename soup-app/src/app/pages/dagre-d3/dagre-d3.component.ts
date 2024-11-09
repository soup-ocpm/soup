import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
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
export class DagreD3Component implements OnInit {
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

  /**
   * Get the graph details
   */
  private getGraphDetails(): void {
    const standardGraph = this.isViewStandardGraph ? '1' : '0';

    this.genericGraphService.getGraph(200, standardGraph).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          console.log(response.responseData);
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
        node.style = 'fill: #fff; stroke: #000; stroke-width: 2px';
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
    }
  }

  /**
   * This method allow to add unique  Node for EKG
   * @param uniqueNodes the array of nodes
   * @param node the unique node to add .
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
   * Select specific node
   * @param nodeId the node id
   */
  public selectNode(nodeId: string): void {
    const nodeElement = d3.select(`g.node[id="${nodeId}"]`).node() as SVGGraphicsElement;

    if (!nodeElement) {
      return;
    }

    const node = this.g.node(nodeId);
    console.log(node);

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
  public selectClassNodeSearched(searched: any): void {
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
  public filteredNodes(): any {
    const standardNodeFilters: any[] = [];

    if (!this.searchTerm) {
      return this.nodes;
    }

    this.nodes.forEach((item: any) => {
      for (const key in item) {
        if (item[key] && item[key].toString().toLowerCase().includes(this.searchTerm.toLowerCase())) {
          standardNodeFilters.push(item);
        }
      }
    });

    return standardNodeFilters;
  }

  /**
   * Close the search sidebar
   */
  public closeSearchSidebar(): void {
    this.isOpenSearchSidebar = false;
    this.selectedNode = null;
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
