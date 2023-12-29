import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, Renderer2, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
// Material Import
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
// Service Import
import { GraphService } from '../../services/graph.service';
import { GraphDataService } from 'src/app/services/graph.data.service';
// Other components import
import { DialogDeleteGraphComponent } from '../../components/dialog-delete-component/dialog-delete-graph.component';
import { DialogHelpClassComponent } from 'src/app/components/dialog-help-class-component/dialog-help-class.component';
// Graph library import:
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
import * as saveAs from 'file-saver';
import { zoom } from 'd3-zoom';


@Component({
  selector: 'app-graph-page',
  templateUrl: './graph-page.component.html',
  styleUrls: ['./graph-page.component.scss']
})
export class GraphPageComponent implements OnInit, OnDestroy {

  // ElementRef container to show SVG of the Graph. 
  @ViewChild('graphSvg', { static: true }) graphContainer!: ElementRef;

  // The variable for the g graph.
  g: any;

  // The SVG of the Graph
  svg: any;

  // Variable for the zoom
  zoom: any;

  // Zoom of the SVG.
  currentZoomEvent: any;

  // All nodes of Standard Graph.
  nodes: any = [];

  // All edges of Standard Graph.
  edges: any = [];

  // All edges of Class Graph.
  classNodes: any = [];

  // All edges of Class Graph.
  classEdges: any = [];

  // Map for track colors for Edges
  private relationLabelColors: Map<string, string> = new Map<string, string>();

  // Color palette for Edges
  private predefinedColors: string[] = [
    '#3f51b5', '#ff5722', '#4caf50', '#e91e63', '#ffc107',
    '#795548', '#00bcd4', '#9c27b0', '#8bc34a', '#2196f3',
    '#ff9800', '#607d8b', '#009688', '#f44336', '#673ab7'
  ];

  // The data contains info (nodes and edges) of the Graph.
  retrievedData: any;

  // Search string by User for search nodes or links
  searchQuery: string = '';

  // Searched results (nodes or links)
  searchResults: any[] = [];

  /**
   * Boolean variables that indicates if there
   * are result about the Search
   */
  researched: boolean | undefined;

  // Selected researched Node
  selectedNode: any;

  // Properties of the researched Node
  propertiesSelectedNode: any = [];

  /**
   * Boolean variables that indicate if 
   * the Card about the Node properties 
   * is show or not.
   */
  showCardPropertis: boolean | undefined;

  /**
   * Boolean variable that indicate if the
   * Sidebar for menu is showed or not.
  */
  showSideBarMenu: boolean = false;

  /**
   * Boolean variable that indicate if the
   * Sidebar for menu is showed or not.
  */
  showSideBarSearch: boolean = false;

  /**
   * Boolean variable that indicate if the
   * Sidebar for the Group is showed or not
   */
  showGroupSidebar: boolean = false;

  /**
   * Boolean variable that indicate if is 
   * showing progress bar.
  */
  showProgressBar: boolean | undefined;

  /**
   * Boolean variable that indicates if 
   * the Class graph is showing or not.
  */
  isShowingClassGraph: boolean | undefined;

  /**
   * List of filtered columns that 
   * the user has selected in the past
   */
  entitiesList: string[] | undefined;

  /**
   * List of columns filtered by 
   * the user for the creation of the Class Graph.
   */
  selectedEntities: string[] = [];

  /**
  * Boolean variable that indicate if 
  * there is Class graph saved.
  */
  haveClassData: boolean = false;


  /**
   * Constructor for GraphPageComponent component.
   * @param router the Router for navigation.
   * @param snackBar the snackbar.
   * @param dialog the dialog.
   * @param serviceCall the service for API calls
   * @param serviceData the service for retrieve data.
   * @param httpClient the httpClient for send call to Server.
   * @param renderer the renderer for render graph.
   */
  constructor(
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private serviceCall: GraphService,
    private serviceData: GraphDataService,
    private httpClient: HttpClient,
    private renderer: Renderer2
  ) {
    this.graphContainer = new ElementRef(null);
  }


  // NgOnInit implementation
  public ngOnInit() {
    if (!this.serviceCall.hasResponse()) {
      this.openSnackBar('Error', 'Retry');
      this.router.navigateByUrl('/welcome');
      return;
    }
    this.showProgressBar = true;
    this.isShowingClassGraph = false;
    this.g = new dagreD3.graphlib.Graph().setGraph({ rankdir: 'LR' });
    this.retrievedData = this.serviceCall.getResponse();
    this.entitiesList = this.serviceData.getFilteredColumn();
    this.injectStandardData(this.retrievedData);
  }


  //NgOnDestroy method implementation
  public ngOnDestroy(): void {
    this.retrievedData = null;
    this.showProgressBar = true;
    this.serviceCall.deleteResponse();
    this.nodes = [];
    this.edges = [];
    this.classNodes = [];
    this.classEdges = [];
  }


  /**
  * Method that create and show Standard graph.
  * @param graphContainer the container HTML for show the Graph.
  * @param htmlId the html id.
  * @param nodes the nodes of Standard graph.
  * @param edges the edges of Standard graph.
  */
  public createStandardGraphVisualization(graphContainer: ElementRef, htmlId: string, nodes: any[], edges: any[]) {
    const container = document.getElementById(htmlId);
    if (container) {
      const width = container.clientWidth;
      const height = container.clientHeight;

      this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: true })
        .setGraph({ rankdir: 'LR', nodesep: 25 });

      this.g.setDefaultEdgeLabel(function () {
        return {};
      })

      nodes.forEach((node: any) => {
        const nodeId = node.EventID;
        this.g.setNode(nodeId, { label: node.ActivityName, ...node });
      });

      // SVG NODES
      this.g.nodes().forEach((v: any) => {
        var node = this.g.node(v);
        node.rx = node.ry = 5;
        node.style = 'fill: #fff; stroke: #000; stroke-width: 2px';
        node.shape = 'circle';
      });

      edges.forEach(edge => {
        const source = edge.source.EventID;
        const target = edge.target.EventID;
        const total_rel_name = `DF : {${edge.labelRelation}}`;
        const color = this.relationLabelColors.get(edge.labelRelation) || '#3f51b5';

        this.g.setEdge(source, target, {
          name: total_rel_name,
          label: total_rel_name,
          labelStyle: `font-family: Georgia, 'Times New Roman', Times, serif;`,
          style: `stroke: ${color}; stroke-width: 3px; fill: rgba(219, 219, 219, 0);`,
          arrowheadStyle: `fill: ${color};`,
          curve: d3.curveBasis,
          labeloffset: 5,
        }, total_rel_name);
      });

      // Create the render for SVG
      const render = new dagreD3.render();

      // Set up an SVG group to render the graph
      const svg = d3.select(graphContainer.nativeElement)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const svgGroup = svg.append('g');

      this.initializePanZoom(svg, svgGroup, width, height);
      // Run the renderer to draw the graph
      render(svgGroup as any, this.g as any);
    }
  }


  /**
   * Method that allow to inject nodes and edges 
   * into the corrispective array, by a data json value.
   * @param data the data of the json.
   */
  public injectStandardData(data: any) {
    const uniqueNodes = new Map<string, any>();
    const uniqueDfLinks: any = [];

    // -----RETRIEVE NODES------
    data.graph_data.forEach((item: any) => {
      const nodeId = item.node.EventID;
      if (nodeId && !uniqueNodes.has(nodeId)) {
        uniqueNodes.set(nodeId, item.node);
      }
    });

    // -----RETRIEVE DF RELATIONSHIPS------
    data.graph_data.forEach((item: any) => {
      const parentNode = item.node;
      const relationNode = item.relation_node;
      const relationType = item.type;
      const relationId = item.relationId;

      // Ensure uniqueness based on EventID
      const parentNodeId = parentNode.EventID;
      const relationNodeId = relationNode.EventID;

      if (parentNodeId && relationNodeId) {
        if (!uniqueNodes.has(parentNodeId)) {
          uniqueNodes.set(parentNodeId, parentNode);
        }

        if (!uniqueNodes.has(relationNodeId)) {
          uniqueNodes.set(relationNodeId, relationNode);
        }

        // Create link
        const link = {
          source: parentNode,
          target: relationNode,
          label: `:DF`,
          labelRelation: relationType,
          relationId: relationId,
        };
        uniqueDfLinks.push(link);
      }
    });

    const nodes = Array.from(uniqueNodes.values());
    const edges = uniqueDfLinks;
    this.nodes = nodes;
    this.edges = edges;

    if (this.nodes != null && this.nodes.length > 0 && this.edges != null && this.edges.length > 0) {
      this.assignRelationLabelColors(this.edges, false);
      this.createStandardGraphVisualization(
        this.graphContainer,
        'myGraphContainer',
        this.nodes,
        this.edges
      );
    }
  }


  /**
  * Method that create and show Class graph.
  * @param graphContainer the container HTML for show the Graph.
  * @param htmlId the html id.
  * @param nodes the nodes of Class graph.
  * @param edges the edges of Class graph.
  */
  public createClassGraphVisualization(graphContainer: ElementRef, htmlId: string, nodes: any[], edges: any[]) {
    const container = document.getElementById(htmlId);
    if (container) {
      this.setGraphLayout();

      const width = container.clientWidth;
      const height = container.clientHeight;

      this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: true })
        .setGraph({ rankdir: 'LR' });

      nodes.forEach((node: any) => {
        let nodeName = node.Name;
        let nodeId = node.id;
        let nodeProperties: any = {
          label: nodeName,
          name: nodeName,
        };

        for (const prop in node) {
          if (node.hasOwnProperty(prop)) {
            nodeProperties[prop] = node[prop];
          }
        }
        this.g.setNode(nodeId, nodeProperties, nodeId);
      });

      this.g.nodes().forEach((v: any) => {
        var node = this.g.node(v);
        node.rx = node.ry = 5;
        node.style = 'fill: #fff; stroke: #000; stroke-width: 2px';
        node.shape = 'circle';
      });

      edges.forEach(edge => {
        if (edge.label && edge.source.id && edge.target.id) {
          const color = this.relationLabelColors.get(edge.label) || '#3f51b5';
          this.g.setEdge(`${edge.source.id}`, `${edge.target.id}`, {
            label: `${edge.label}`,
            style: `stroke: ${color}; stroke-width: 3px; fill: rgba(219, 219, 219, 0);`,
            arrowheadStyle: `fill: ${color} ;`,
            curve: d3.curveBasis,
            labeloffset: 5,
          }, edge.label);
        }
      });

      this.haveClassData = true;

      // Create the render for SVG
      const render = new dagreD3.render();

      // Set up an SVG group to render the graph
      const svg = d3.select(graphContainer.nativeElement)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const svgGroup = svg.append('g');

      this.initializePanZoom(svg, svgGroup, width, height);

      render(svgGroup as any, this.g as any);
    }
  }


  /**
   * Method that allow to inject nodes and edges for Class Graph
   * into the corrispective array, by a data json value.
   * @param data the data of the json.
   */
  public injectClassData(data: any) {
    let uniqueNodes = new Set<any>();
    const uniqueDfLinks = new Set<any>();

    data.df_c_data.forEach((item: any) => {
      let node_parent = item.class;
      this.addNode(uniqueNodes, node_parent);
      let relationShips = item.related_class;
      let forRelation = item.type;

      relationShips.forEach((node_rel: any) => {
        this.addNode(uniqueNodes, node_rel);
        const link = {
          source: node_parent,
          target: node_rel,
          label: `:DF_C: {${forRelation}}`,
        }
        uniqueDfLinks.add(link);
      });
    });

    const links = [...uniqueDfLinks];
    this.classNodes = Array.from(uniqueNodes);
    this.classEdges = links;

    if (this.classNodes != null && this.classEdges != null && this.classNodes.length > 0 && this.classEdges.length > 0) {
      this.clearGraphs();
      this.isShowingClassGraph = true;
      this.assignRelationLabelColors(this.classEdges, true);
      this.createClassGraphVisualization(this.graphContainer, 'myGraphContainer', this.classNodes, this.classEdges);
    } else {
      this.openSnackBar('Error while creating Class graph.', 'Retry');
    }
  }


  /**
  * This method allow to add new Node for g3
  * @param uniqueNodes the array of nodes
  * @param node the unique node to add .
  */
  public addNode(uniqueNodes: Set<any>, node: any) {
    let nodeExists = false;

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
  private assignRelationLabelColors(edges: any[], isClass: boolean) {
    edges.forEach((edge: any) => {
      let label;
      if (isClass) {
        label = edge.label;
      } else {
        label = edge.labelRelation
      }

      if (!this.relationLabelColors.has(label)) {
        const colorIndex = this.relationLabelColors.size % this.predefinedColors.length;
        const color = this.predefinedColors[colorIndex];
        this.relationLabelColors.set(label, color);
      }
    });
  }


  /**
  * This method initializes the zoom for graph display.
  * @param svg the svg.
  * @param svgGroup the svgGroup.
  */
  public initializePanZoom(svg: any, svgGroup: any, width: any, height: any) {
    this.showProgressBar = false;
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
  public standardGraphSearch() {
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
  * This method allow to search specific Node 
  * or Link. 
  */
  public classGraphSearch() {
    this.searchResults = this.classNodes.filter((node: any) => {
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
  public selectStandardNodeSearched(searched: any) {
    if (this.selectedNode) {
      return;
    }

    let node = this.g.node(searched.EventID);

    if (node) {
      this.selectedNode = node;
      const centerX = node.x;
      const centerY = node.y;

      node.style = 'fill: #8AC5FF; stroke: #488FEF; stroke-width: 2px';

      const zoomTransform = d3.zoomIdentity.translate(-centerX, -centerY).scale(2);
      this.svg.call(this.zoom.transform, zoomTransform);

      const render = new dagreD3.render();
      render(this.svg, this.g);

      this.nodes.forEach((nodeStandard: any) => {
        if (this.selectedNode.EventID != null && this.selectedNode.EventID == nodeStandard.EventID) {
          this.propertiesSelectedNode = Object.entries(nodeStandard);
          this.showCardPropertis = true;
        }
      });
    }
  }

  /**
  * This method allow to redirect the User
  * to the node searched.
  * @param searched the searched node.
  */
  public selectClassNodeSearched(searched: any) {
    if (this.selectedNode) {
      return;
    }

    let node = this.g.node(searched.id);

    if (node) {
      this.selectedNode = node;
      const centerX = node.x;
      const centerY = node.y;
      console.log('Coordinate x del nodo:', node.x);
      console.log('Coordinate y del nodo:', node.y);

      node.style = 'fill: #8AC5FF; stroke: #488FEF; stroke-width: 2px';

      const zoomTransform = d3.zoomIdentity.translate(-centerX, -centerY).scale(2);
      this.svg.call(this.zoom.transform, zoomTransform);

      const render = new dagreD3.render();
      render(this.svg, this.g);

      this.classNodes.forEach((nodeStandard: any) => {
        if (this.selectedNode.id != null && this.selectedNode.id == nodeStandard.id) {
          this.propertiesSelectedNode = Object.entries(nodeStandard);
          this.showCardPropertis = true;
        }
      });
    }
  }


  /**
  * Method that allow User to download
  * the SVG of the Graph.
  */
  public exportSvg() {
    const svgContent = document.querySelector('#myGraphContainer svg');
    if (svgContent != null) {
      const svgBlob = new Blob([svgContent.outerHTML], { type: 'image/svg+xml' });
      saveAs(svgBlob, 'graph.svg');
    }
  }


  // -----------BUILD CLASS GRAPH METHODS-----------------


  /**
  * This method allow to create the new Graph (Class Nodes)
  */
  public buildClassGraph() {
    this.showProgressBar = true;
    const formData = new FormData();
    let responseData: any;
    this.serviceCall.createClassGraph(formData, this.selectedEntities)
      .subscribe(
        (response) => {
          responseData = response;
          if (responseData.status == 200) {
            this.getClassGraph();
          }
        },
        (error) => {
          responseData = error;
          this.showProgressBar = false;
          this.openSnackBar('Error while creating Class Graph', 'Retry');
        });

  }


  /**
  * Method that get all data (Nodes, Edges...) of new Class Graph.
  */
  public getClassGraph() {
    let responseData: any;
    return this.httpClient.get('http://127.0.0.1:8080/api/v1/graph-class')
      .subscribe(
        (response) => {
          responseData = response;
          if (responseData.status == 200) {
            this.injectClassData(responseData);
          }
        },
        (error) => {
          responseData = error;
          this.showProgressBar = false;
          this.openSnackBar('Error while build Class graph.', 'Retry');
        });
  }


  // -----------SUPPORT METHODS-----------------


  // Set page layout for Class Graph visualization.
  public setGraphLayout() {
    this.isShowingClassGraph = true;
    this.showGroupSidebar = false;
    this.showSideBarMenu = false;
    this.showSideBarSearch = false;
  }


  /**
  * Method that clear Graph by remove nodes and 
  * relationships
  */
  public clearGraphs() {
    this.g.nodes().forEach((v: any) => this.g.removeNode(v));
    this.g.edges().forEach((e: any) => this.g.removeEdge(e));
    const svg = d3.select(this.graphContainer.nativeElement);
    svg.selectAll("*").remove();
  }


  /**
  * Method that allow to show the Standard
  * graph when Class graph is show
  * (if Class graph is already created)
  */
  public turnOnStandardGraph() {
    this.isShowingClassGraph = false;
    this.haveClassData = true;
    this.clearGraphs();
    this.createStandardGraphVisualization(this.graphContainer,
      'myGraphContainer',
      this.nodes,
      this.edges)
  }


  /**
  * Method that allow to show the Class
  * graph when Standard graph is show
  * (if Class graph is already created)
  */
  public turnOnClassGraph() {
    this.clearGraphs();
    this.isShowingClassGraph = true;
    this.createClassGraphVisualization(this.graphContainer,
      'myGraphContainer',
      this.classNodes,
      this.classEdges);
  }


  /**
  * This method open the Dialog for the 
  * confermation about Graph delete.
  */
  public openDialogDelete() {
    this.dialog.open(DialogDeleteGraphComponent);
  }


  /**
  * This method open the Dialog for the 
  * info about class graph.
  */
  public openDialogHelpClass() {
    this.dialog.open(DialogHelpClassComponent);
  }


  /**
  * Open Snackbar with specific message and action (button)
  * @param message the message
  * @param action the action
  */
  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }


  /**
  * Method that allow to get the toggle entities for 
  * build the Class Graph.
  * @param entity the selected entity
  */
  public toggleSelection(entity: string) {
    if (this.selectedEntities.includes(entity)) {
      this.selectedEntities = this.selectedEntities.filter(item => item !== entity);
    } else {
      this.selectedEntities.push(entity);
    }
  }


  /**
  * This method close the search
  * and reset all searched nodes and edges.
  */
  public closeSearched() {
    this.searchResults = [];
    this.searchQuery = '';
    this.researched = false;
    this.closeNodeSearched();
  }


  /**
  * This method close the Node searched
  */
  public closeNodeSearched() {
    if (this.selectedNode) {
      this.selectedNode.style = 'fill: #fff; stroke: #000; stroke-width: 2px';

      const zoomTransform = d3.zoomIdentity;
      this.svg.call(this.zoom.transform, zoomTransform);

      const render = new dagreD3.render();
      render(this.svg, this.g);

      this.selectedNode = null;
    }
  }


  /**
  * This method close the Card about
  * Node selected properties and information.
  */
  public closeCardProperties() {
    this.showCardPropertis = false;
    this.closeNodeSearched();
  }


  /**
  * This method open the Sidebar for the Class
  * group option. 
  */
  public openGroupSidebar() {
    this.showGroupSidebar = true;
    const rightSidebar = document.querySelector('.right');
    if (rightSidebar) {
      this.renderer.addClass(rightSidebar, 'opaque-sidebar');
    }
  }


  /**
  * This method close the Sidebar for the Class
  * group option. 
  */
  public closeGroupSidebar() {
    this.showGroupSidebar = false;
    const rightSidebar = document.querySelector('.right');
    if (rightSidebar) {
      this.renderer.removeClass(rightSidebar, 'opaque-sidebar');
    }
  }
}
