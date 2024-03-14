import {Component, OnInit} from '@angular/core';
import {Router} from "@angular/router";

// Services import
import {StandardGraphService} from "../../services/standard_graph.service";
import {ClassGraphService} from "../../services/class_graph.service";
import {SupportDataService} from "../../services/support_data.service";

// Component import
import {HelpClassDialogComponent} from "../../components/help-class-dialog/help-class-dialog.component";
import {DeleteDialogComponent} from "../../components/delete-dialog/delete-dialog.component";

// Material import
import {MatSnackBar} from "@angular/material/snack-bar";
import {MatDialog} from "@angular/material/dialog";

// Models import
import {Card} from "../../models/card.model";

// Other import
import {saveAs} from "file-saver";

@Component({
  selector: 'app-details',
  templateUrl: './details.component.html',
  styleUrl: './details.component.scss'
})
export class DetailsComponent implements OnInit {

  // The full JSON data for Graph
  public fullJsonData: any = [];

  // Card for the Event nodes
  public eventCard: Card | undefined;

  // Card for the Entity nodes
  public entityCard: Card | undefined;

  // Card for :CORR edges
  public corrEdgeCard: Card | undefined;

  // Card for :DF edges
  public dfEdgeCard: Card | undefined;

  // The extended Card
  public cardExtended: any;

  // List of entities
  public entitiesList: string [] = [];

  // List of selected entities
  public selectedEntities: string [] = [];

  // If the Card is extended
  public isCardExtended: boolean = false;

  // If Sidebar is show or not
  public isShowSidebar: boolean = false;

  // If the second Sidebar is show or not
  public isShowSecondSidebar: boolean = false;

  // If the progress bar is loading or not
  public isLoadingProgressBar: boolean = false;

  // If the User have the Class graph in Database
  public haveCreatedClassGraph: boolean = false;

  // If the User have access to the view of Graph
  public isShowNextPageBtn: boolean = false;

  /**
   * Constructor for DetailsComponent component
   * @param router the Router
   * @param snackBar the Material Snackbar
   * @param dialog the Material dialog
   * @param standardGraphService the StandardGraphService service
   * @param classGraphService the ClassGraphService service
   * @param supportService the SupportDataService service
   */
  constructor(
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private standardGraphService: StandardGraphService,
    private classGraphService: ClassGraphService,
    private supportService: SupportDataService,
  ) {
  }

  // NgOnInit implementation
  ngOnInit(): void {
    if (!this.standardGraphService.hasResponse()) {
      this.router.navigate(['/home']);
      return;
    }
    this.fullJsonData = this.standardGraphService.apiResponse;
    this.injectDataToCard();

    if (this.supportService.getHaveRetrievedInformation()) {
      this.injectFilteredColumnToService();
      this.getClassGraph(false);
    } else {
      this.entitiesList = this.supportService.getFilteredColumn();
    }

    if (this.supportService.hasShowClassGraph) {
      this.isShowNextPageBtn = true;
      this.haveCreatedClassGraph = true;
    }
  }

  // Inject the JSON data to the specific Cards
  public injectDataToCard(): void {
    if (this.fullJsonData == null) {
      this.openSnackBar('Error', 'Retry');
      this.router.navigate(['/home']);
      return;
    }

    // Create Event nodes Card
    if (this.fullJsonData.event_count != null) {
      const cardTitle = 'Event Nodes';
      const cardType = 'nodes';
      let numberOfData = this.fullJsonData.event_count;
      const cardDescription: string = `Generated ${numberOfData} event nodes`;
      const jsonData = this.fullJsonData.event_nodes;

      this.eventCard = new Card(cardTitle, cardType, cardDescription, jsonData, numberOfData);
    }

    // Create Entity nodes Card
    if (this.fullJsonData.entity_count != null) {
      const cardTitle = 'Entity Nodes';
      const cardType = 'nodes';
      let numberOfData = this.fullJsonData.entity_count;
      const cardDescription: string = `Generated ${numberOfData} entity nodes`;
      const jsonData = this.fullJsonData.entity_nodes;

      this.entityCard = new Card(cardTitle, cardType, cardDescription, jsonData, numberOfData);
    }

    // Create :CORR relationsips card
    if (this.fullJsonData.correlation_count != null) {
      const cardTitle = ':CORR Relationships';
      const cardType = 'relationships';
      let numberOfData = this.fullJsonData.correlation_count;
      const cardDescription: string = `Generated ${numberOfData} :corr edges`;
      const jsonData = this.fullJsonData.correlation_data;

      this.corrEdgeCard = new Card(cardTitle, cardType, cardDescription, jsonData, numberOfData);
    }

    if (this.fullJsonData.df_count != null) {
      const cardTitle = ':DF Relationships';
      const cardType = 'relationships';
      let numberOfData = this.fullJsonData.df_count;
      const cardDescription: string = `Generated ${numberOfData} :df edges`;
      const jsonData = this.fullJsonData.df_data;

      this.dfEdgeCard = new Card(cardTitle, cardType, cardDescription, jsonData, numberOfData);
    }
  }

  // Inject filtered column by the User
  public injectFilteredColumnToService(): void {
    let apiResponse: any;

    const entities: string[] = [];
    this.standardGraphService.getGraphEntities().subscribe(
      responseData => {
        apiResponse = responseData;
        if (apiResponse != null && apiResponse.http_status_code == 200) {
          if (apiResponse.response_data != null) {
            apiResponse.response_data.forEach((item: string) => {
              entities.push(item);
            })
          }
        }
      }, errorData => {
        apiResponse = errorData;
        console.log(apiResponse);
      });

    const nullEntities: string[] = [];
    this.standardGraphService.getNaNEntities().subscribe(
      responseData => {
        apiResponse = responseData;
        if (apiResponse != null && apiResponse.http_status_code == 200) {
          if (apiResponse.response_data != null) {
            apiResponse.response_data.forEach((item: string) => {
              nullEntities.push(item);
            });
          }
        }
      }, errorData => {
        apiResponse = errorData;
      });

    console.log(entities);
    console.log(nullEntities);

    /**
     const filteredColumn: Set<string> = new Set<string>();
     this.entityCard?.jsonData.forEach((item: any) => {
     if (!filteredColumn.has(item.Type)) {
     filteredColumn.add(item.Type);
     }
     });
     this.supportService.setFilteredColumn(Array.from(filteredColumn.values()))
     this.entitiesList = this.supportService.getFilteredColumn();
     */
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
    if (this.fullJsonData != null) {
      const jsonString = JSON.stringify(this.fullJsonData, null, 2);
      const svgBlob = new Blob([jsonString], {type: 'json'});
      saveAs(svgBlob, `graph_data.json`);
    }
  }

  // Build the Class Graph
  public buildClassGraph(): void {
    if (this.haveCreatedClassGraph) {
      this.deleteAndBuildClassGraph();
    } else {
      this.buildNewClassGraph();
    }
  }

  // Only build the new graph
  public buildNewClassGraph(): void {
    this.isLoadingProgressBar = true;

    const formData: FormData = new FormData();
    let responseData: any;
    this.classGraphService.createClassGraph(formData, this.selectedEntities).subscribe(
      response => {
        responseData = response;
        console.log(responseData);
        if (responseData.http_status_code == 201) {
          this.getClassGraph(true);
        }
      },
      (error) => {
        responseData = error;
        console.log(responseData);
        this.isLoadingProgressBar = false;
        this.openSnackBar('Error while creating Class Graph', 'Retry');
      });
  }

  // Delete the existing class graph then build the new
  public deleteAndBuildClassGraph(): void {
    if (this.haveCreatedClassGraph) {
      let apiResponse: any;
      this.classGraphService.deleteClassGraph().subscribe(
        response => {
          apiResponse = response;
          console.log(apiResponse);
          if (apiResponse != null && apiResponse.http_status_code == 200) {
            this.openSnackBar('Class graph deleted.', 'Ok');
            this.buildNewClassGraph();
          }
        }, error => {
          apiResponse = error;
          if (apiResponse != null) {
            if (apiResponse.http_status_code == 404) {
              this.openSnackBar('Error while delete graph.', 'Retry');
              return;
            } else if (apiResponse.http_status_code == 500) {
              this.openSnackBar('Interal Server Error.', 'Retry');
              return;
            }
          }
        });
    }
  }

  /**
   * Retrieve the created Class Graph and navigate the
   * User to the Graph page
   */
  public getClassGraph(creation: boolean): void {
    let apiResponse: any;
    this.classGraphService.getClassGraph().subscribe(
      response => {
        apiResponse = response;
        if (apiResponse != null && apiResponse.response_data != null) {
          this.classGraphService.saveResponse(apiResponse.response_data);
          this.isLoadingProgressBar = false;
          if (creation) {
            this.router.navigate(['/graph']);
          } else {
            this.haveCreatedClassGraph = true;
          }
        }
      },
      error => {
        apiResponse = error;
        if (apiResponse.http_status_code == 404 && !creation) {
          this.haveCreatedClassGraph = false;
        }
        this.isLoadingProgressBar = false;

        if (creation) {
          this.openSnackBar('Error while retrieve class Graph', 'Retry');
        }
      });
  }

  /**
   * Resize the Card selected by the User
   * @param event the Event Emitter <boolean>
   * @param card the Card to resize
   */
  public resizeCard(event: boolean, card: Card): void {
    if (event) {
      this.isCardExtended = true;
      this.cardExtended = card;
    } else {
      this.isCardExtended = false;
      this.cardExtended = null;
    }
  }


  // -------SUPPORT METHODS-----------

  // Toggle the first Sidebar
  public toggleFirstSidebar(): void {
    this.isShowSidebar = !this.isShowSidebar;
  }

  // Toggle the second Sidebar (for group)
  public toggleSecondSidebar(): void {
    this.isShowSecondSidebar = !this.isShowSecondSidebar;
  }

  // Open dialog for delete graph
  public openDialogDelete(): void {
    this.dialog.open(DeleteDialogComponent, {
      data: {isClass: false},
    });
  }

  // Open dialog for help
  public openDialogHelpClass(): void {
    this.dialog.open(HelpClassDialogComponent);
  }

  // Handle the click for show Graph
  public handleClickNextView(): void {
    this.router.navigate(['/graph']);
  }

  /**
   * Open the SnackBar with message and action
   * @param message the message
   * @param action the action
   */
  public openSnackBar(message: string, action: string): void {
    this.snackBar.open(message, action);
  }
}
