import { Component, OnInit, } from '@angular/core';
import { Router } from '@angular/router';

// Services import
import { SocketService } from '../../core/services/socket.service';
import { ClassGraphService } from '../../services/class_graph.service';
import { SupportDataService } from '../../services/support_data.service';
import { NotificationService } from '../../services/notification.service';
import { GenericGraphService } from '../../services/generic_graph.service';
import { StandardGraphService } from '../../services/standard_graph.service';

// Component import
import { HelpClassDialogComponent } from '../../components/help-class-dialog/help-class-dialog.component';
import { DeleteDialogComponent } from '../../components/delete-dialog/delete-dialog.component';

// Material import
import { MatDialog } from '@angular/material/dialog';

// Models import
import { Card } from '../../core/models/card.model';

// Other import
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-details',
  templateUrl: './details.component.html',
  styleUrl: './details.component.scss',
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
  public entitiesList: {
    name: string;
    numberOfNanNodes: number;
    presentNanNodes: boolean;
  }[] = [];

  // List of selected entities
  public selectedEntities: string[] = [];

  // If the Card is extended
  public isCardExtended: boolean = false;

  // If Sidebar is show or not
  public isShowSidebar: boolean = true;

  // If the second Sidebar is show or not
  public isShowSecondSidebar: boolean = false;

  // If the progress bar is loading or not
  public isLoadingProgressBar: boolean = false;

  // If the User have the Class graph in Database
  public haveCreatedClassGraph: boolean = false;

  // If the User have access to the view of Graph
  public isShowNextPageBtn: boolean = false;

  // The progress data from WebSocket
  public progressData: any;

  // The complete data from WebSocket
  public completeData: any;

  // The error data from WebSocket
  public errorData: any;

  /**
   * Constructor for DetailsComponent component
   * @param router the Router
   * @param dialog the Material dialog
   * @param messageService the NotificationService service
   * @param standardGraphService the StandardGraphService service
   * @param classGraphService the ClassGraphService service
   * @param supportService the SupportDataService service
   * @param socketService the SocketService service
   */
  constructor(
    private router: Router,
    private dialog: MatDialog,
    private messageService: NotificationService,
    private genericGraphService: GenericGraphService,
    private standardGraphService: StandardGraphService,
    private classGraphService: ClassGraphService,
    private supportService: SupportDataService,
    private socketService: SocketService
  ) { }

  // NgOnInit implementation
  ngOnInit(): void {
    if (!this.standardGraphService.hasResponse()) {
      this.router.navigate(['/home']);
      return;
    }
    this.fullJsonData = this.standardGraphService.apiResponse;
    this.injectDataToCard();

    if (this.supportService.getHaveRetrievedInformation()) {
      this.getClassGraph(false);
    }

    if (this.supportService.hasShowClassGraph) {
      this.isShowNextPageBtn = true;
      this.haveCreatedClassGraph = true;
    }

    // Subscription for Web Socket service
    this.socketService.progress.subscribe((data) => {
      this.progressData = data;
      console.log(this.progressData);
    });

    this.socketService.complete.subscribe((data) => {
      this.completeData = data;
      console.log(this.completeData);
    });

    this.socketService.error.subscribe((data) => {
      this.errorData = data;
      console.log(this.errorData);
    });
  }

  // Inject the JSON data to the specific Cards
  public injectDataToCard(): void {
    if (this.fullJsonData == null) {
      this.messageService.show('Error. Retry', false, 2000);
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

      this.eventCard = new Card(
        cardTitle,
        cardType,
        cardDescription,
        jsonData,
        numberOfData
      );
    }

    // Create Entity nodes Card
    if (this.fullJsonData.entity_count != null) {
      const cardTitle = 'Entity Nodes';
      const cardType = 'nodes';
      let numberOfData = this.fullJsonData.entity_count;
      const cardDescription: string = `Generated ${numberOfData} entity nodes`;
      const jsonData = this.fullJsonData.entity_nodes;

      this.entityCard = new Card(
        cardTitle,
        cardType,
        cardDescription,
        jsonData,
        numberOfData
      );
    }

    // Create :CORR relationsips card
    if (this.fullJsonData.correlation_count != null) {
      const cardTitle = ':CORR Relationships';
      const cardType = 'relationships';
      let numberOfData = this.fullJsonData.correlation_count;
      const cardDescription: string = `Generated ${numberOfData} :corr edges`;
      const jsonData = this.fullJsonData.correlation_data;

      this.corrEdgeCard = new Card(
        cardTitle,
        cardType,
        cardDescription,
        jsonData,
        numberOfData
      );
    }

    if (this.fullJsonData.df_count != null) {
      const cardTitle = ':DF Relationships';
      const cardType = 'relationships';
      let numberOfData = this.fullJsonData.df_count;
      const cardDescription: string = `Generated ${numberOfData} :df edges`;
      const jsonData = this.fullJsonData.df_data;

      this.dfEdgeCard = new Card(
        cardTitle,
        cardType,
        cardDescription,
        jsonData,
        numberOfData
      );
    }
    this.getGraphEntities();
  }

  // Inject filtered column by the User
  public getGraphEntities(): void {
    let apiResponse: any;

    this.standardGraphService.getGraphEntities().subscribe(
      (responseData) => {
        apiResponse = responseData;
        if (apiResponse != null && apiResponse.http_status_code == 200) {
          if (apiResponse.response_data != null) {
            apiResponse.response_data.forEach((item: string) => {
              let entity = {
                name: item,
                numberOfNanNodes: 0,
                presentNanNodes: false,
              };
              this.entitiesList.push(entity);
            });
            this.getNanEntities();
          }
        }
      },
      (errorData) => {
        apiResponse = errorData;
      }
    );
  }

  // Retrieve NaN entities
  public getNanEntities(): void {
    let apiResponse: any;
    const nullEntities: string[] = [];

    this.standardGraphService.getNaNEntities().subscribe({
      next: (responseData) => {
        apiResponse = responseData;
        console.log(apiResponse);
        if (apiResponse != null && apiResponse.http_status_code == 200) {
          if (apiResponse.response_data != null) {
            apiResponse.response_data.forEach((item: string) => {
              nullEntities.push(item);
            });

            this.entitiesList.forEach((entity) => {
              nullEntities.forEach((item: any) => {
                if (item.property_name == entity.name) {
                  entity.presentNanNodes = true;
                  entity.numberOfNanNodes = item.count_nodes;
                }
              });
            });
          }
        }
      },
      error: (errorData) => {
        apiResponse = errorData;
      },
      complete: () => { },
    });
  }

  /**
   * Method that allow to get the toggle entities for
   * build the Class Graph.
   * @param entity the selected entity
   */
  public toggleSelection(entity: any): void {
    if (this.selectedEntities.includes(entity.name)) {
      this.selectedEntities = this.selectedEntities.filter(
        (item) => item !== entity.name
      );
    } else {
      this.selectedEntities.push(entity.name);
    }
  }

  public showStandardGraph(): void {
    this.router.navigate(['/details-graph']);
  }

  /**
   * Export the JSON Graph generated
   */
  public exportGraphJSON(): void {
    if (this.fullJsonData != null) {
      const jsonString = JSON.stringify(this.fullJsonData, null, 2);
      const svgBlob = new Blob([jsonString], { type: 'json' });
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
    this.classGraphService
      .createClassGraph(formData, this.selectedEntities)
      .subscribe(
        (response) => {
          responseData = response;
          if (responseData.http_status_code == 201) {
            if (this.haveCreatedClassGraph) {
              this.messageService.show(
                'The old Graph has been successfully deleted. Creating the new graph...',
                true,
                3000
              );
            } else {
              this.messageService.show(
                'Class Graph created successfully',
                true,
                2000
              );
            }
            this.getClassGraph(true);
          }
        },
        (error) => {
          responseData = error;
          this.isLoadingProgressBar = false;
          this.messageService.show(
            'Error while creating Class Graph. Retry',
            false,
            3000
          );
        }
      );
  }

  // Delete the existing class graph then build the new
  public deleteAndBuildClassGraph(): void {
    if (this.haveCreatedClassGraph) {
      let apiResponse: any;
      this.classGraphService.deleteClassGraph().subscribe(
        (response) => {
          apiResponse = response;
          if (apiResponse != null && apiResponse.http_status_code == 200) {
            this.buildNewClassGraph();
          }
        },
        (error) => {
          apiResponse = error;
          if (apiResponse != null) {
            if (apiResponse.http_status_code == 404) {
              this.messageService.show(
                'Error removing the Graph. Retry',
                false,
                2000
              );
              return;
            } else if (apiResponse.http_status_code == 500) {
              this.messageService.show(
                'Internal Server Error. Retry',
                false,
                2000
              );
              return;
            }
          }
        }
      );
    }
  }

  /**
   * Retrieve the created Class Graph and navigate the
   * User to the Graph page
   */
  public getClassGraph(creation: boolean): void {
    let apiResponse: any;
    this.genericGraphService.getGraph('2').subscribe(
      (response) => {
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
      (error) => {
        apiResponse = error;
        if (apiResponse.http_status_code == 404 && !creation) {
          this.haveCreatedClassGraph = false;
        }
        this.isLoadingProgressBar = false;

        if (creation) {
          this.messageService.show(
            'Error while retrieve Class Graph. Retry',
            false,
            2000
          );
        }
      }
    );
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

      if (this.isShowSidebar) {
        this.isShowSidebar = !this.isShowSidebar;
      }
    } else {
      this.isCardExtended = false;
      this.cardExtended = null;
      this.isShowSidebar = !this.isShowSidebar;
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

  public getEntityWarningPhrase(entity: any) {
    return `${entity.numberOfNanNodes} nodes have Nan value. The generated graph may not be accurate.`;
  }

  // Open dialog for delete graph
  public openDialogDelete(): void {
    this.dialog.open(DeleteDialogComponent, {
      data: { isClass: false },
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
}
