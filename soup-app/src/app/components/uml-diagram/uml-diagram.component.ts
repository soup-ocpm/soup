import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';

import { UMLEdge } from './models/uml_edge';
import { UMLNode } from './models/uml_node';

/**
 * UML Dialog Component
 * @version 1.0.0
 * @since 2.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-uml-diagram',
  standalone: true,
  imports: [],
  templateUrl: './uml-diagram.component.html',
  styleUrl: './uml-diagram.component.scss'
})
export class UmlDiagramComponent implements OnInit {
  // The variable for the g graph.
  public g: any;

  // The SVG of the Graph
  public svg: any;

  // Variable for the zoom
  public zoom: any;

  // Zoom of the SVG.
  public currentZoomEvent: any;

  // The uml class notation for the UML Class diagram
  @Input() umlClass: UMLNode[] = [];

  // The uml edge notation for the UML Class diagram
  @Input() umlEdges: UMLEdge[] = [];

  // ElementRef container to show SVG of the Graph.
  @ViewChild('graphSvg', { static: true }) graphContainer!: ElementRef;

  // Constructor for UmlDiagramComponent component
  constructor() {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.createUMLClassDiagram();
  }

  /**
   * Create the UML Class diagram based on the nodes and edges
   */
  private createUMLClassDiagram(): void {
    const container = document.getElementById('myGraphContainer');

    if (container) {
      const width: number = container.clientWidth;
      const height: number = container.clientHeight;

      // Create the graph
      this.g = new dagreD3.graphlib.Graph({ multigraph: true, compound: false }).setGraph({
        rankdir: 'LR',
        nodesep: 70,
        edgesep: 30,
        ranksep: 100
      });

      // Uml class nodes
      this.umlClass.forEach((node) => {
        this.g.setNode(node.id, {
          labelType: 'string',
          label: node.label.replace(/\n/g, '\n'),
          style: 'fill: #FFA726; stroke: #FB8C00; stroke-width: 2px; font-family: Arial; font-size: 12px; color: white;',
          padding: 10
        });
      });

      // Uml class edges
      this.umlEdges.forEach((edge) => {
        const color = '#FB8C00';
        this.g.setEdge(edge.source, edge.target, {
          labelType: 'string',
          label: `${edge.multiplicity.leftMultiplicity}      ${edge.multiplicity.rightMultiplicity}`,
          style: `stroke: ${color}; stroke-width: 2px; fill: none;`,
          arrowheadStyle: `fill: none;`,
          curve: d3.curveLinear
        });
      });

      // Renderer for graph
      const render = new dagreD3.render();

      // SVG configuration
      const svg = d3
        .select(this.graphContainer.nativeElement)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
      const svgGroup = svg.append('g');

      this.initializePanZoom(svg, svgGroup);
      render(svgGroup as any, this.g as any);
    }
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
    svg.call(zoomBehavior);
  }
}
