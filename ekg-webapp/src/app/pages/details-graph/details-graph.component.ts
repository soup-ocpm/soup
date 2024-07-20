import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

// Services import
import { NotificationService } from '../../services/notification.service';
import { GenericGraphService } from '../../services/generic_graph.service';

// Graph library import:
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
import { zoom } from 'd3-zoom';

@Component({
  selector: 'app-details-graph',
  templateUrl: './details-graph.component.html',
  styleUrl: './details-graph.component.scss'
})
export class DetailsGraphComponent implements OnInit {
  // Response data
  public responseData: any;

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
  public allRelationships: { name: string, selected: boolean }[] = [];

  // Search string by User for search nodes or links
  public searchQuery: string = '';

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
  public isShowSearchSidebar: boolean = false;

  // Map for track colors for Edges
  public relationLabelColors: Map<string, string> = new Map<string, string>();

  // ElementRef container to show SVG of the Graph.
  @ViewChild('graphSvg', { static: true }) graphContainer!: ElementRef;

  // Color palette for Edges
  private predefinedColors: string[] = [
    '#3f51b5', '#ff5722', '#4caf50', '#e91e63', '#ffc107',
    '#795548', '#00bcd4', '#9c27b0', '#8bc34a', '#2196f3',
    '#ff9800', '#607d8b', '#009688', '#f44336', '#673ab7'
  ];

  /**
   * Constructor for DetailsGraphComponent component
   * @param router the Router
   * @param messageService the MessageService service
   * @param genericGraphService the GenericGraphService service
   * @param standardGraphService the StandardGraphService service
   */
  constructor(
    private router: Router,
    private messageService: NotificationService,
    private genericGraphService: GenericGraphService
  ) {
  }

  // NgOnInit implementation
  ngOnInit() {
    this.genericGraphService.getGraph('1').subscribe({
      next: responseData => {
        this.responseData = responseData;
        if (this.responseData['http_status_code'] == 200 && this.responseData['response_data'] != null) {
          this.injectGraphData(this.responseData['response_data']);
        } else {
          this.messageService.show('Error while retrieving graph. Retry', false, 1);
          this.router.navigate(['/details']);
        }
      }, error: errorData => {
        this.messageService.show('Error while retrieving graph. Retry', false, 1);
        this.router.navigate(['/details']);
      }, complete: () => {
      }
    });

    this.g = new dagreD3.graphlib.Graph().setGraph({ rankdir: 'LR' });
  }

  /**
   * Method that allow to inject nodes and edges for Class Graph
   * into the corrispective array, by a data json value.
   * @param data the data of the json.
   */
  public injectGraphData(data: any): void {
    let uniqueEventNodes: Set<any> = new Set<any>();
    const uniqueDfLinks: Set<any> = new Set<any>();

    data.forEach((item: any): void => {
      let node_parent = item['node_source'];
      let edge = item.edge;

      this.addNode(uniqueEventNodes, node_parent);

      let edge_weight = 1;

      if (edge['edge_weight'] != null) {
        edge_weight = edge['edge_weight'];
      }

      let label = edge['Type']

      if (edge['relation'] != null) {
        label = edge['relation']
      }

      let link = {
        auto_id: edge['id'],
        weight: edge_weight,
        source: node_parent,
        target: null,
        personal_id: null,
        label: label
      }

      if (edge['ID'] != null) {
        link.personal_id = edge['ID']
      }

      if (item['node_target'] != null) {
        let node_target = item['node_target'];
        this.addNode(uniqueEventNodes, node_target);
        link.target = node_target;
      }

      uniqueDfLinks.add(link);
    });

    this.nodes = Array.from(uniqueEventNodes);
    this.edges = [...uniqueDfLinks];
    console.log(this.nodes);
    console.log(this.edges);

    if (this.nodes.length > 0 && this.edges.length > 0) {
      this.assignRelationLabelColors(this.edges);
      this.createClassGraphVisualization(this.graphContainer, 'myGraphContainer');
    } else {
      this.messageService.show('Error while creating the Class Graph. Retry', false, 2000);
      this.router.navigate(['/details']);
    }
  }

  /**
   * Method that create and show Class graph.
   * @param graphContainer the container HTML for show the Graph.
   * @param htmlId the html id.
   */
  public createClassGraphVisualization(graphContainer: ElementRef, htmlId: string): void {
    const container = document.getElementById(htmlId);
    if (container) {

      const width: number = container.clientWidth;
      const height: number = container.clientHeight;

      this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: true })
        .setGraph({ rankdir: 'LR', nodesep: 25, multiedgesep: 10 });

      this.nodes.forEach((node: any): void => {
        let nodeId = node['id'];
        let nodeName = node['ActivityName'];
        let nodeProperties: any = {
          label: nodeName,
        };

        for (const prop in node) {
          if (node.hasOwnProperty(prop)) {
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
          this.g.setEdge(`${edge.source.id}`, `${edge.target.id}`, {
            weight: edge.weight,
            label: `${edge.label}` + `: ${edge.weight}`,
            style: `stroke: ${color}; fill: rgba(219, 219, 219, 0);`,
            arrowheadStyle: `fill: ${color} ;`,
            curve: d3.curveBasis,
            labelpos: 'c', // label position to center
            labeloffset: 5,
            extensible: true
          }, edge.label);
        }
      });

      // Create the render for SVG
      const render: dagreD3.Render = new dagreD3.render();

      // Set up an SVG group to render the graph
      const svg = d3.select(graphContainer.nativeElement)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

      const svgGroup = svg.append('g');

      this.initializePanZoom(svg, svgGroup);

      render(svgGroup as any, this.g as any);

    }
  }

  /**
   * This method allow to add new Node for g3
   * @param uniqueNodes the array of nodes
   * @param node the unique node to add .
   */
  public addNode(uniqueNodes: Set<any>, node: any) {
    let nodeExists: boolean = false;

    for (let existingNode of uniqueNodes) {
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
   * This methods assign colors for Edges
   * @param edges the array of Edges
   */
  public assignRelationLabelColors(edges: any[]): void {
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
   * This method initializes the zoom for graph display.
   * @param svg the svg.
   * @param svgGroup the svgGroup.
   */
  public initializePanZoom(svg: any, svgGroup: any): void {
    this.svg = svg;
    const zoomBehavior = zoom().on('zoom', (event) => {
      this.currentZoomEvent = event;
      svgGroup.attr('transform', event.transform);
    });

    this.zoom = zoomBehavior;
    svg.call(zoomBehavior);
  }

  /**
   * This method allow to search specific Node
   * or Link.
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
   * This method allow to redirect the User
   * to the node searched.
   * @param searched the searched node.
   */
  public selectClassNodeSearched(searched: any): void {
    if (this.selectedNode) {
      return;
    }

    let node = this.g.node(searched.id);

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

  //Handle the click for close the Card properties
  public closeCardProperties(): void {
    this.isShowCardProperties = false;
    this.closeNodeSearched();
  }

  // Handle the click for open Sidebar for search nodes
  public toggleSidebarSearch(): void {
    this.isShowSearchSidebar = true;
  }

  // Handle the click for close the node searched
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

  // Handle the click for close searched
  public closeSearched(): void {
    this.searchResults = [];
    this.searchQuery = '';
    this.researched = false;
    this.closeNodeSearched();
  }

  // Handle the click for go back to details page
  public handleClickBack(): void {
    this.router.navigate(['/details']);
  }
}
