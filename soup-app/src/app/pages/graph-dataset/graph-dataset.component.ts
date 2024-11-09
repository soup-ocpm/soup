import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DataSet, Network } from 'vis-network/standalone';

import { SDividerComponent } from '../../core/components/s-divider/s-divider.component';
import { ToastLevel } from '../../core/enums/toast_type.enum';
import { NotificationService } from '../../core/services/toast.service';
import { Dataset } from '../../models/dataset.model';
import { ClassGraphService } from '../../services/class_graph.service';
import { GenericGraphService } from '../../services/generic_graph.service';
import { StandardGraphService } from '../../services/standard_graph.service';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

@Component({
  selector: 'app-graph-dataset',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    // Application component import
    SDividerComponent
  ],
  templateUrl: './graph-dataset.component.html',
  styleUrl: './graph-dataset.component.scss'
})
export class GraphDatasetComponent implements OnInit {
  // The dataset name
  public currentDataset: Dataset | undefined;

  // The standard graph nodes (not DataSet object)
  public standardNodes: any[] = [];

  // The selected node
  public selectedNode: any;

  // The network
  public network: Network | undefined;

  // The graph nodes
  public nodes = new DataSet<any>([]);

  // The graph edges
  public edges = new DataSet<any>([]);

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

  // The view child for the Network Graph container
  @ViewChild('treeContainer', { static: true }) treeContainer: ElementRef | undefined;

  /**
   * Constructor for GraphDataComponent component
   * @param router the Router
   * @param toast the NotificationService service
   * @param activatedRoute the ActivatedRoute
   * @param standardGraphService the StandardGraphService service
   * @param classGraphService the ClassGraphService service
   * @param supportService the LocalDataService service
   */
  constructor(
    private router: Router,
    private toast: NotificationService,
    private activatedRoute: ActivatedRoute,
    private standardGraphService: StandardGraphService,
    private classGraphService: ClassGraphService,
    private supportService: LocalDataService,
    private genericGraphService: GenericGraphService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    const datasetName = this.activatedRoute.snapshot.paramMap.get('name');
    this.currentDataset = this.supportService.getCurrentDataset();

    if (this.currentDataset != null && this.currentDataset.name == datasetName) {
      this.isViewStandardGraph = this.supportService.viewStandardGraph;

      if (this.isViewStandardGraph) {
        this.getGraphDetails();
      } else {
        this.getGraphDetails();
      }
    } else {
      this.toast.show('Unable to retrieve Graph. Retry', ToastLevel.Error, 3000);
      this.router.navigate(['/welcome']);
      return;
    }
  }

  /**
   * Get the graph details
   */
  private getGraphDetails(): void {
    this.isLoading = true;
    let apiResponse: any;

    this.genericGraphService.getGraph(200, this.currentDataset!.name).subscribe({
      next: (responseData) => {
        apiResponse = responseData;

        if (apiResponse != null && apiResponse['http_status_code'] == 200 && apiResponse['response_data'] != null) {
          this.injectData(apiResponse['response_data']);
        } else {
          this.isLoading = false;
          this.toast.show('Unable to retrieve Graph. Retry', ToastLevel.Error, 3000);
          this.router.navigate(['/datasets', this.currentDataset!.name]);
        }
      },
      error: (errorData) => {
        apiResponse = errorData;
        this.isLoading = false;
        this.toast.show('Unable to retrieve Graph. Retry', ToastLevel.Error, 3000);
        this.router.navigate(['/datasets', this.currentDataset!.name]);
      },
      complete: () => {}
    });
  }

  // Inject the data to prepare the network
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

      const nodeTarget = item['node_target'];
      nodeTarget['label'] = nodeTarget['ActivityName'];

      // Aggiungi la logica per gestire più relazioni
      if (nodeTarget != null) {
        this.addNode(uniqueNodes, nodeTarget);
        const linkCount = [...uniqueDfRelationships].filter((link) => link.from === nodeSource.id && link.to === nodeTarget.id).length;

        const link = {
          auto_id: edge['id'],
          weight: edgeWeight,
          from: nodeSource['id'],
          to: nodeTarget['id'],
          personal_id: null,
          label: label,
          smooth: {
            type: linkCount % 2 === 0 ? 'curvedCW' : 'curvedCCW',
            roundness: (linkCount + 1) * 0.2
          }
        };

        if (edge['ID'] != null) {
          link.personal_id = edge['ID'];
        }

        uniqueDfRelationships.add(link);
      }
    });

    this.standardNodes = Array.from(uniqueNodes);
    this.nodes = new DataSet(Array.from(uniqueNodes));
    this.edges = new DataSet([...uniqueDfRelationships]);
    this.setupNetwork();
  }

  /**
   * This method allow to add new Node for g3
   * @param uniqueNodes the array of nodes
   * @param node the unique node to add .
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
      uniqueNodes.add(node);
    }
  }

  // Setup the graph (network)
  public setupNetwork(): void {
    const colorMap: Record<string, string> = this.generateColorMapForLabels(this.edges.get());

    // Applicare il colore agli archi in base alla label
    this.edges.update(
      this.edges.get().map((edge) => {
        return {
          ...edge,
          color: {
            color: colorMap[edge.label]
          }
        };
      })
    );

    const data = {
      nodes: this.nodes,
      edges: this.edges
    };

    this.network = new Network(this.treeContainer!.nativeElement, data, {
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'LR',
          nodeSpacing: 200,
          levelSeparation: 300, // Spazio tra i livelli del grafo
          treeSpacing: 100, // Spazio tra i rami del grafo
          sortMethod: 'directed' // Metodo di ordinamento dei nodi
        }
      },
      physics: {
        enabled: false
      },
      edges: {
        arrows: {
          to: { enabled: true, scaleFactor: 1 }
        },
        color: 'green',
        smooth: true,
        font: {
          align: 'middle',
          size: 14,
          color: 'black'
        }
      },
      nodes: {
        shape: 'box',
        color: {
          background: 'white',
          border: 'black'
        },
        font: {
          color: 'black',
          size: 16,
          face: 'arial'
        },
        margin: {
          top: 20,
          bottom: 20,
          left: 40,
          right: 40
        }
      }
    });

    // Event listeners
    this.network.on('selectNode', (params) => {
      this.onNodeClick(params, null);
    });

    // this.network.on('selectEdge', (params) => {
    //   this.onEdgeClick(params);
    // });

    this.network.on('click', () => {
      this.onNetworkClick();
    });
  }

  /**
   * Handle the click on specific node
   * @param params the params
   */
  public onNodeClick(params: any | null, node: any | null): void {
    if (this.selectedNode != null) {
      this.nodes.update({
        id: this.selectedNode.id,
        color: {
          background: 'white',
          border: 'black'
        }
      });
    }
    let selectedNodeId: number | null = null;

    if (node != null && node.id != null) {
      selectedNodeId = node.id;
    } else {
      if (params != null && params.nodes.length) {
        selectedNodeId = params.nodes[0];
      }
    }

    if (selectedNodeId != null) {
      this.selectedNode = this.nodes.get(selectedNodeId);
      this.nodes.update({ id: selectedNodeId, border: 'orange', color: '#ffc869' });

      // Focus on the node
      this.network!.focus(selectedNodeId, {
        scale: 2,
        animation: {
          duration: 500,
          easingFunction: 'easeInOutQuad'
        }
      });
    }
  }

  /**
   * Handle the click to specific edge
   * @param params the params
   */
  private onEdgeClick(params: any): void {
    if (params.edges.length) {
      const selectedEdgeId = params.edges[0];

      this.network!.focus(selectedEdgeId, {
        scale: 2,
        animation: {
          duration: 500,
          easingFunction: 'easeInOutQuad'
        }
      });
    }
  }

  /**
   * Handle the click on the network
   */
  private onNetworkClick(): void {
    this.nodes.forEach((node) => {
      this.nodes.update({
        id: node.id,
        color: {
          background: 'white',
          border: 'black'
        }
      });
    });
  }

  /**
   * Filter nodes by the search term
   */
  public filteredNodes(): any {
    const standardNodeFilters: any[] = [];

    if (!this.searchTerm) {
      return this.standardNodes;
    }

    this.standardNodes.forEach((item: any) => {
      for (const key in item) {
        if (item[key] && item[key].toString().toLowerCase().includes(this.searchTerm.toLowerCase())) {
          standardNodeFilters.push(item);
        }
      }
    });

    return standardNodeFilters;
  }

  /**
   * Leave the graph page
   */
  public leavePage(): void {
    this.router.navigate(['datasets', this.currentDataset!.name]);
  }

  public closeSearchSidebar(): void {
    this.isOpenSearchSidebar = false;
    this.selectedNode = null;
    this.onNetworkClick();
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

  // --------SUPPORT NETWORK FUNCTION-------

  // Funzione per generare una mappa di colori unica per ciascuna label
  private generateColorMapForLabels(edges: any[]): Record<string, string> {
    const uniqueLabels = Array.from(new Set(edges.map((edge) => edge.label)));
    const colorMap: Record<string, string> = {};

    // Generare colori unici per ciascuna etichetta
    uniqueLabels.forEach((label, index) => {
      colorMap[label] = this.getRandomColor(index);
    });

    return colorMap;
  }

  // Funzione per generare colori casuali (o predefiniti) basati sull'indice
  private getRandomColor(index: number): string {
    const colors = [
      '#FF5733', // Rosso
      '#33FF57', // Verde
      '#3357FF', // Blu
      '#F4D03F', // Giallo
      '#8E44AD', // Viola
      '#1ABC9C', // Turchese
      '#E67E22', // Arancione
      '#2ECC71', // Verde chiaro
      '#3498DB', // Azzurro
      '#E74C3C', // Rosso scuro
      '#9B59B6', // Viola scuro
      '#16A085', // Verde acqua
      '#F39C12', // Giallo ocra
      '#D35400', // Arancione bruciato
      '#2980B9', // Blu mare
      '#8E44AD', // Viola intenso
      '#C0392B', // Rosso profondo
      '#27AE60', // Verde foresta
      '#2C3E50', // Blu scuro
      '#BDC3C7', // Grigio chiaro
      '#7F8C8D', // Grigio fumo
      '#ECF0F1', // Bianco sporco
      '#34495E', // Blu notte
      '#E74C3C', // Rosso acceso
      '#95A5A6', // Grigio acciaio
      '#D35400', // Arancione scuro
      '#F5B041', // Giallo dorato
      '#1F618D', // Blu oltremare
      '#5D6D7E', // Blu grigiastro
      '#D98880', // Rosa tenue
      '#C39BD3', // Lilla
      '#7DCEA0', // Verde menta
      '#F7DC6F' // Giallo pastello
    ];

    return colors[index % colors.length];
  }
}
