import { AfterViewInit, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

// Component Import
import { DialogDeleteGraphComponent } from 'src/app/components/dialog-delete-component/dialog-delete-graph.component';
import { DialogHelpClassComponent } from 'src/app/components/dialog-help-class-component/dialog-help-class.component';

// Service Import
import { GraphService } from 'src/app/services/graph.service';
import { GraphDataService } from 'src/app/services/graph.data.service';

// Material Import
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

// Model Import
import { Card } from 'src/app/models/card.model';

// Other Import
import * as saveAs from 'file-saver';
import { ClassGraphService } from 'src/app/services/class_graph.service';
import { HttpClient } from '@angular/common/http';


@Component({
  selector: 'app-detail-cards',
  templateUrl: './detail-cards.component.html',
  styleUrls: ['./detail-cards.component.scss']
})
export class DetailCardsComponent implements OnInit, AfterViewInit {

  // The full JSON data for Graph
  public jsonData: any = [];

  // The Card for Event nodes
  public eventsCard: Card | undefined;

  // The Card for Entity nodes
  public entitiesCard: Card | undefined;

  // The Card for :CORR relationships
  public corrEdgesCard: Card | undefined;

  // The Card for :DF relationships
  public dfEdgesCard: Card | undefined;

  // Extended Card or not
  public extendedCard: boolean = false;

  // The Card that is extended
  public cardExtended: any;

  /**
   * List of filtered columns that 
   * the user has selected in the past
   */
  public entitiesList: string[] | undefined;

  /**
   * List of columns filtered by 
   * the user for the creation of the Class Graph.
   */
  public selectedEntities: string[] = [];

  // If the Sidebar is open or not
  public isSidebarOpen: boolean = false;

  // If the Group Sidebar is open or not
  public isGroupSidebarOpen: boolean = false;

  // Show the Progress Bar for create/show Graph
  public showProgressBar: boolean = false;


  /**
   * Constructor for DetailCardsComponent component
   * @param router the Router
   * @param graphService the GraphService service
   * @param snackBar the SnackBar 
   */
  constructor(
    private router: Router,
    private graphService: GraphService,
    private classService: ClassGraphService,
    private graphDataService: GraphDataService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private httpClient: HttpClient,
  ) { }

  // NgOnInit implementation
  ngOnInit(): void {
    if (!this.graphService.hasResponse()) {
      this.openSnackBar('Error', 'Retry');
      this.router.navigateByUrl('/home');
      return;
    }
    this.jsonData = this.graphService.apiResponse;
    this.entitiesList = this.graphDataService.getFilteredColumn();
    this.injectDataToCard();
  }

  // NgAfterViewInit implementation
  ngAfterViewInit(): void { }


  public addTemporalCard() {
    let jsonData: any;
    this.httpClient.get('http://localhost:4200/assets/graph.json').subscribe(
      (response) => {
        jsonData = response;
        this.entitiesList = ['Actor', 'Order', 'SupplierOrder'];
        this.eventsCard = new Card('Event nodes', 'nodes', 'Created 50 event nodes', jsonData, 50);
        this.entitiesCard = new Card('Entity nodes', 'nodes', 'Generated 50 entity nodes', jsonData, 50);
        this.corrEdgesCard = new Card(':CORR Relatinships', 'relationships', 'Generated 250 :CORR edges', jsonData, 250);
        this.dfEdgesCard = new Card(':DF Relatinships', 'relationships', 'Generated 150 :DF edges', jsonData, 150);
      });
  }

  /**
   * Inject the JSON data to Card
   */
  public injectDataToCard(): void {
    if (this.jsonData == null || this.jsonData == undefined) {
      this.openSnackBar('Error', 'Retry');
      this.router.navigateByUrl('/home');
      return;
    }

    // Create Event nodes Card
    if (this.jsonData.event_count != null && this.jsonData.event_count != undefined) {
      const cardTitle = 'Event Nodes';
      const cardType = 'nodes';
      let numberOfData = this.jsonData.event_count;
      const cardDescription = `Generated ${numberOfData} event nodes`;
      const jsonData = this.jsonData.event_nodes;

      this.eventsCard = new Card(cardTitle, cardType, cardDescription, jsonData, numberOfData);
    }

    // Create Entity nodes Card
    if (this.jsonData.entity_count != null && this.jsonData.entity_count != undefined) {
      const cardTitle = 'Entity Nodes';
      const cardType = 'nodes';
      let numberOfData = this.jsonData.entity_count;
      const cardDescription = `Generated ${numberOfData} entity nodes`;
      const jsonData = this.jsonData.entity_nodes;

      this.entitiesCard = new Card(cardTitle, cardType, cardDescription, jsonData, numberOfData);
    }

    // Create :CORR relationsips card
    if (this.jsonData.correlation_count != null && this.jsonData.correlation_count != undefined) {
      const cardTitle = ':CORR Relationships';
      const cardType = 'relationships';
      let numberOfData = this.jsonData.correlation_count;
      const cardDescription = `Generated ${numberOfData} :corr edges`;
      const jsonData = this.jsonData.correlation_data;

      this.corrEdgesCard = new Card(cardTitle, cardType, cardDescription, jsonData, numberOfData);
    }

    if (this.jsonData.df_count != null && this.jsonData.df_count != undefined) {
      const cardTitle = ':DF Relationships';
      const cardType = 'relationships';
      let numberOfData = this.jsonData.correlation_count;
      const cardDescription = `Generated ${numberOfData} :df edges`;
      const jsonData = this.jsonData.df_data;

      this.dfEdgesCard = new Card(cardTitle, cardType, cardDescription, jsonData, numberOfData);
    }
  }

  /**
   * Check if the Cards are not undefined
   * @returns true if one or more card are undefined, false 
   * otherwise
   */
  public haveCardsData(): boolean {
    if (this.eventsCard == undefined || this.entitiesCard == undefined || this.corrEdgesCard == undefined
      || this.dfEdgesCard == undefined) {
      return false;
    }
    return true;
  }

  /**
   * Method that allow to get the toggle entities for 
   * build the Class Graph.
   * @param entity the selected entity
   */
  public toggleSelection(entity: string): void {
    if (this.selectedEntities.includes(entity)) {
      this.selectedEntities = this.selectedEntities.filter(item => item !== entity);
    } else {
      this.selectedEntities.push(entity);
    }
  }

  /**
   * Export the JSON Graph generated
   */
  public exportGraphJSON(): void {
    if (this.jsonData != null && this.jsonData != undefined) {
      const jsonString = JSON.stringify(this.jsonData, null, 2);
      const svgBlob = new Blob([jsonString], { type: 'json' });
      saveAs(svgBlob, `graph_data.json`);
    }
  }

  /**
   * Build the Class Graph
   */
  public buildClassGraph(): void {
    this.showProgressBar = true;

    const formData = new FormData();
    let responseData: any;
    this.classService.createClassGraph(formData, this.selectedEntities).subscribe(
      (response) => {
        responseData = response;
        if (responseData.http_status_code == 201) {
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
   * Retrieve the created Class Graph and navigate the 
   * User to the Graph page
   */
  public getClassGraph() {
    let apiResponse: any;
    this.classService.getClassGraph().subscribe(
      (response) => {
        apiResponse = response;
        if (apiResponse != null) {
          this.classService.saveResponse(apiResponse.response_data);
          this.showProgressBar = false;
          this.router.navigateByUrl('/graph');
        }
      },
      (error) => {
        apiResponse = error;
        this.showProgressBar = false;
        this.openSnackBar('Error while retrieve class Graph', 'Retry');
      });
  }

  /**
   * Resize the Card selected by the User
   * @param event the Event Emitter <boolean>
   * @param card the Card to resize
   */
  public resizeCard(event: boolean, card: Card): void {
    if (event == true) {
      this.extendedCard = true;
      this.cardExtended = card;
    } else {
      this.extendedCard = false;
      this.cardExtended = null;
    }
  }

  /**
   * Toggle or not the Sidebar
   */
  public toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  /**
   * Toggle or not the Group Sidebar
   */
  public toggleGroupSidebar(): void {
    this.isGroupSidebarOpen = !this.isGroupSidebarOpen;
  }

  /**
   * Close the Sidebar by Event Emitter
   * @param event the event
   */
  public closeSidebar(event: Event): void {
    event.stopPropagation();
    this.isSidebarOpen = false;
  }

  /**
   * Open the SnackBar with message and action
   * @param message the messagere
   * @param action the action
   */
  public openSnackBar(message: string, action: string): void {
    this.snackBar.open(message, action);
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
}