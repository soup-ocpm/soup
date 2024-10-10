import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

// Material Import
import { MatDialog } from '@angular/material/dialog';

// Service Import
import { ClassGraphService } from '../../services/class_graph.service';
import { SupportDataService } from '../../services/support_data.service';
import { NotificationService } from '../../services/notification.service';

// Other components import
import { DeleteDialogComponent } from '../../components/delete-dialog/delete-dialog.component';

// Graph library import:
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
import saveAs from 'file-saver';
import { zoom } from 'd3-zoom';
import { StandardGraphService } from '../../services/standard_graph.service';

@Component({
  selector: 'app-graph',
  templateUrl: './graph.component.html',
  styleUrl: './graph.component.scss'
})
export class GraphComponent implements OnInit {

  // The data contains info (nodes and edges) of the Graph.
  public retrievedData: any;

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

  // If the menu Sidebar is show or not
  public isShowMenuSidebar: boolean = false;

  // If the search Sidebar is show or not
  public isShowSearchSidebar: boolean = false;

  // If the manage graph Sidebar is show or not
  public isShowManageGraphSidebar: boolean = false;

  // Selected the type of node
  public nodeViewType: string = 'Rectangular';

  // List of node type (rectangular or circular)
  public allNodesViewType: string[] = ['Rectangular', 'Circular'];

  // All type of relationships
  public allRelationships: { name: string, selected: boolean }[] = [];

  // The dataset name
  public datasetName: string = '';

  // ElementRef container to show SVG of the Graph.
  @ViewChild('graphSvg', { static: true }) graphContainer!: ElementRef;

  // Map for track colors for Edges
  public relationLabelColors: Map<string, string> = new Map<string, string>();

  // Color palette for Edges
  private predefinedColors: string[] = [
    '#3f51b5', '#ff5722', '#4caf50', '#e91e63', '#ffc107',
    '#795548', '#00bcd4', '#9c27b0', '#8bc34a', '#2196f3',
    '#ff9800', '#607d8b', '#009688', '#f44336', '#673ab7'
  ];

  // The weight scale for relationships weight
  private weightScale: any;

  /**
   * Constructor for GraphComponent component
   * @param router the Router
   * @param dialog the Material dialog
   * @param messageService the NotificationService service
   * @param classGraphService the ClassGraphService service
   * @param supportDataService the SupportDataService service
   */
  constructor(
    private router: Router,
    private dialog: MatDialog,
    private messageService: NotificationService,
    private standardGraphService: StandardGraphService,
    private classGraphService: ClassGraphService,
    private supportDataService: SupportDataService,
  ) {
    this.graphContainer = new ElementRef(null);
  }

  // NgOnInit implementation
  public ngOnInit(): void {
    if (!this.classGraphService.hasResponse()) {
      this.router.navigate(['/details']);
      return;
    }
    this.g = new dagreD3.graphlib.Graph().setGraph({ rankdir: 'LR' });
    this.retrievedData = this.classGraphService.getResponse();
    this.datasetName = this.standardGraphService.datasetName;
    
    this.injectClassData(this.retrievedData);
  }

  /**
   * Method that allow to inject nodes and edges for Class Graph
   * into the corrispective array, by a data json value.
   * @param data the data of the json.
   */
  public injectClassData(data: any): void {
    let uniqueNodes: Set<any> = new Set<any>();
    const uniqueDfLinks: Set<any> = new Set<any>();

    data.forEach((item: any): void => {
      let node_parent = item.node_source;
      let relation = item.edge;

      this.addNode(uniqueNodes, node_parent);

      let link = {
        id: relation.id,
        weight: relation.edge_weight,
        source: node_parent,
        target: null,
        label: `${relation.Type}`,
      }

      if (item.node_target != null) {
        let node_target = item.node_target;
        this.addNode(uniqueNodes, node_target);
        link.target = node_target;
      }
      uniqueDfLinks.add(link);
    });

    const links: any[] = [...uniqueDfLinks];
    this.nodes = Array.from(uniqueNodes);
    this.edges = links;

    if (this.nodes != null && this.edges != null && this.nodes.length > 0 && this.edges.length > 0) {
      this.assignRelationLabelColors(this.edges);
      this.createClassGraphVisualization(this.graphContainer, 'myGraphContainer');
    } else {
      this.messageService.show('Error while creating the Class Graph. Retry', false, 2000);
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
      this.setGraphLayout();

      const width: number = container.clientWidth;
      const height: number = container.clientHeight;

      this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: true })
        .setGraph({ rankdir: 'LR', nodesep: 25, multiedgesep: 10 });

      this.nodes.forEach((node: any): void => {
        let nodeId = node.id;
        let nodeName = node.ActivityName;
        let nodeProperties: any = {
          label: nodeName,
        };

        for (const prop in node) {
          if (node.hasOwnProperty(prop)) {
            nodeProperties[prop] = node[prop];
          }
        }
        this.g.setNode(nodeId, nodeProperties, node.Event_Id);
      });

      this.g.nodes().forEach((v: any): void => {
        const node = this.g.node(v);
        node.rx = node.ry = 5;
        node.style = 'fill: #fff; stroke: #000; stroke-width: 2px';
        node.labelStyle = "font-size: 2.3em";
      });

      const uniqueEdgeWeight: Set<any> = new Set<any>();

      this.edges.forEach((edge: any): void => {
        if (edge != null && edge.weight != null) {
          uniqueEdgeWeight.add(edge.weight);
        }
      });

      const sortedWeightArray = Array.from(uniqueEdgeWeight).sort((a, b) => a - b);

      this.weightScale = d3.scaleLinear()
        .domain([sortedWeightArray[0], sortedWeightArray[sortedWeightArray.length - 1]])
        .range([2, 5]);

      this.edges.forEach((edge: any): void => {
        if (edge.label && edge.source.id && edge.target.id) {
          const color: string = this.relationLabelColors.get(edge.label) || '#3f51b5';
          const strokeWidth: number = this.weightScale(edge.weight);

          this.g.setEdge(`${edge.source.id}`, `${edge.target.id}`, {
            weight: edge.weight,
            label: `${edge.label}` + `: ${edge.weight}`,
            style: `stroke: ${color}; stroke-width: ${strokeWidth}px; fill: rgba(219, 219, 219, 0);`,
            arrowheadStyle: `fill: ${color} ;`,
            curve: d3.curveBasis,
            labelpos: 'c', // label position to center
            labeloffset: 5,
            extensible: true,
            labelStyle: "font-size: 2.3em"
          }, edge.label);
        }
      });

      // Create the render for SVG
      const render: dagreD3.Render = new dagreD3.render();

      // Set up an SVG group to render the graph
      const svg = d3.select(graphContainer.nativeElement)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const svgGroup = svg.append('g');

      this.initializePanZoom(svg, svgGroup);

      render(svgGroup as any, this.g as any);

      this.supportDataService.updateShowGraph(true);
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
  public classGraphSearch(): void {
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

  /**
   * Method that allow User to download
   * the SVG of the Graph.
   */
  public exportSvg(): void {
    const svgContent = document.querySelector('#myGraphContainer svg');
    if (svgContent != null) {
      const svgBlob = new Blob([svgContent.outerHTML], { type: 'image/svg+xml' });
      saveAs(svgBlob, 'graph.svg');
    }
  }

  // -----------SUPPORT METHODS-----------------

  /**
   * Change relationships view
   * @param relationship the relationship
   * @param event the event
   */
  public onChangeRelationshipsView(relationship: { name: string, selected: boolean }, event: any): void {

    if (event == false) {
      this.g.edges().forEach((e: any): void => {
        if (e.name == relationship.name) {
          this.g.removeEdge(e);
        }
      })
    } else {
      this.edges.forEach((edge: any): void => {
        if (edge.label && edge.source.id && edge.target.id && edge.label == relationship.name) {

          const color: string = this.relationLabelColors.get(edge.label) || '#3f51b5';
          const strokeWidth: number = this.weightScale(edge.weight);

          this.g.setEdge(`${edge.source.id}`, `${edge.target.id}`, {
            label: `${edge.label}` + `: ${edge.weight}`,
            style: `stroke: ${color}; stroke-width: ${strokeWidth}px; fill: rgba(219, 219, 219, 0);`,
            arrowheadStyle: `fill: ${color} ;`,
            curve: d3.curveBasis,
            labelpos: 'c', // label position to center
            labeloffset: 5,
            extensible: true
          }, edge.label);
        }
      });
    }

    const render = new dagreD3.render();
    render(this.svg, this.g);
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
        node.shape = 'rect'
      }
    });

    const render = new dagreD3.render();
    render(this.svg, this.g);
  }

  // Set page layout for Class Graph visualization.
  public setGraphLayout(): void {
    this.isShowMenuSidebar = false;
    this.isShowSearchSidebar = false;
  }

  // Open dialog for delete graph
  public openDialogDelete(): void {
    this.dialog.open(DeleteDialogComponent, {
      data: { isClass: true, datasetName: this.datasetName },
    });
  }

  // Handle the click for close searched
  public closeSearched(): void {
    this.searchResults = [];
    this.searchQuery = '';
    this.researched = false;
    this.closeNodeSearched();
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

  //Handle the click for close the Card properties
  public closeCardProperties(): void {
    this.isShowCardProperties = false;
    this.closeNodeSearched();
  }

  // Handle the click for open Sidebar for search nodes
  public toggleSidebarSearch(): void {
    this.isShowSearchSidebar = true;
  }

  // Handle the click for open Sidebar for manage the graph
  public toggleSidebarManager(): void {
    this.isShowManageGraphSidebar = true;
  }

  // Handle the click for go back to details page
  public handleClickBack(): void {
    this.router.navigate(['/details']);
  }
}
