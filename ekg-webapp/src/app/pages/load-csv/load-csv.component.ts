import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from "@angular/router";

// Components import
import { HelpStandardDialogComponent } from "../../components/help-standard-dialog/help-standard-dialog.component";
import { HelpCreationDialogComponent } from '../../components/help-creation-dialog/help-creation-dialog.component';

// Services import
import { NotificationService } from "../../services/notification.service";
import { StandardGraphService } from "../../services/standard_graph.service";
import { SupportDataService } from "../../services/support_data.service";
import { SocketService } from "../../core/services/socket.service";
import { DockerService } from "../../services/docker.service";

// Material import
import { MatDialog } from "@angular/material/dialog";
import { MatTabGroup } from "@angular/material/tabs";

// Models import
import { Entity } from "../../core/models/entity.model";
import { Container } from "../../core/models/container.model";

// Other import
import { Papa } from "ngx-papaparse";
import { Card } from '../../core/models/card.model';

@Component({
  selector: 'app-load-csv',
  templateUrl: './load-csv.component.html',
  styleUrl: './load-csv.component.scss'
})
export class LoadCsvComponent implements OnInit, OnDestroy {

  // The api response
  public apiResponse: any;

  // List of files
  public files: File[] = [];

  // The selected file
  public selectedFile: File | undefined;

  // If the file was selected or not
  public hasSelectedFile: boolean = false;

  // Column for the table (based on the .csv entities)
  public displayedColumns: string[] = [];

  // Data for the table (based on the .csv)
  public dataSource: any[] = [];

  // All the .csv file entities
  public allFileEntitiesSelected: Entity[] = [];

  // All the .csv file values selected
  public allFileValuesSelected: Entity[] = [];

  // Filtered entities by the user
  public filteredColumn: string[] = [];

  // Name of the event id entity
  public eventIdColumn: string = '';

  // Timestamp of the event id entity
  public timestampColumn: string = '';

  // Activity name of the event id entity
  public activityNameColumn: string = '';

  // The fixed column
  public fixedColumn: string = '';

  // The variable column
  public variableColumn: string = '';

  // If the tutorial is terminated or not
  public isTutorialTerminated: boolean = false;

  // Show the upload area
  public isShowUpload: boolean = false;

  // Show the table (recap csv)
  public isShowTable: boolean = false;

  // Show the sidebar
  public isShowSidebar: boolean = false;

  // Show the containers
  public isShowContainers: boolean = false;

  // If the progress bar is loading or not
  public isLoadingProgressBar: boolean = false;

  // The creation methods for graph (standard or LOAD)
  public creationMethod: string = "1";

  // All docker containers
  public dockerContainers: Container[] = [];

  // The selected container
  public selectedContainer: Container | any;

  // The selected container directory
  public selectedDirectory: string | any;

  // If the user choice the container
  public haveChoiceContainer: boolean = false;

  // If the user choice the directory for the csv file
  public haveChoiceDirectory: boolean = false;

  // The progress data
  public progressData: any;

  // The complete data
  public completeData: any;

  // The error data
  public errorData: any;

  @ViewChild('tabGroup') tabGroup: MatTabGroup | undefined;

  /**
   * Constructor for LoadCsvComponent component
   * @param router the Router
   * @param parser the Papa for parse .csv file
   * @param dialog the Material dialog
   * @param messageService the NotificationService service
   * @param standardGraphService the StandardGraphService service
   * @param dockerService the DockerService service
   * @param supportService the SupportDataService service
   * @param socketService the SocketService service
   */
  constructor(
    private router: Router,
    private parser: Papa,
    private dialog: MatDialog,
    private messageService: NotificationService,
    private standardGraphService: StandardGraphService,
    private dockerService: DockerService,
    private supportService: SupportDataService,
    private socketService: SocketService
  ) {
  }

  // NgOnInit implementation
  ngOnInit(): void {
    // Listen progress creation graph events
    this.socketService.progress.subscribe(
      data => {
        this.progressData = data;
        console.log(this.progressData);
      });

    this.socketService.complete.subscribe(
      data => {
        this.completeData = data;
        console.log(this.completeData);
      });

    this.socketService.error.subscribe(
      data => {
        this.errorData = data;
        console.log(this.errorData);
      });
  }

  // NgOnDestroy implementation
  ngOnDestroy(): void {
    this.files = [];
    this.selectedFile = undefined;
    this.hasSelectedFile = false;
    this.allFileEntitiesSelected = [];
    this.filteredColumn = [];
  }

  /**
   * Handle the selection file
   * @param event the event of upload file
   */
  public onSelectFile(event: any): void {
    if (event.addedFiles.length != 1) {
      this.messageService.show('Only one file can be uploaded', false, 2000);
      return;
    }
    if (this.files.length == 0) {
      this.files.push(...event.addedFiles);
      if (!this.files[0].name.endsWith('.csv')) {
        this.files.splice(this.files.indexOf(event), 1);
        this.selectedFile = undefined;
        this.messageService.show('Only file with CSV extension', false, 2000);
        return;
      }
      this.selectedFile = this.files[0];
      this.hasSelectedFile = true;
    } else {
      this.messageService.show('Only one file can be uploaded', false, 2000);
    }
  }

  /**
   * Handle the remove selected file
   * @param event the event of remove
   */
  public onRemoveFile(event: any): void {
    this.files.splice(this.files.indexOf(event), 1);
    if (this.files.length == 0) {
      this.hasSelectedFile = false;
    }
    this.selectedFile = undefined;
  }

  // Parse (read) the .csv file and save the entities
  public parseCSV(): void {
    if (this.selectedFile) {
      if (this.allFileEntitiesSelected.length > 0 && this.dataSource.length > 0 && this.displayedColumns.length > 0) {
        this.isShowUpload = false;
        this.isShowTable = true;
        return;
      }
      const reader: FileReader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {

          const csvData: string = e.target.result.toString();

          this.parser.parse(csvData, {
            complete: (result): void => {
              const allColumn: string[] = result.meta.fields;
              if (allColumn.length > 0) {
                this.allFileEntitiesSelected = allColumn.map(columnName => ({ name: columnName, selected: false }));
                this.allFileValuesSelected = allColumn.map(columnName => ({ name: columnName, selected: false }));
                this.allFileEntitiesSelected.forEach((item: Entity) => {
                  this.displayedColumns.push(item.name);
                });
                for (let i: number = 0; i < 8; i++) {
                  if (result.data[i] != null) {
                    this.dataSource.push(result.data[i])
                  }
                }
                this.isShowUpload = false;
                this.isShowTable = true;
              }
            },
            header: true
          });
        }
      };
      reader.readAsText(this.selectedFile);
    } else {
      this.messageService.show('Upload the csv file', false, 2000);
    }
  }

  /**
   * Check the selected entity
   * @param entity the entity
   */
  public checkSelectedEntity(entity: string) {
    let checked = 0;
    this.allFileEntitiesSelected.forEach((e: Entity) => {
      if (e.name == entity && e.selected) {
        checked = 1;
      }
    });
    return checked == 1;
  }

  /**
   * Check the selected element
   * @param entity the entity
   */
  public checkSelectedElement(entity: string): boolean {
    let checked = 0;
    this.allFileValuesSelected.forEach((e: Entity) => {
      if (e.name == entity && e.selected && !this.checkSelectedEntity(entity)) {
        checked = 1;
      }
    });

    return checked == 1;
  }

  /**
   * Submit the selected entity
   * @param entity the selected entity
   * @param event the event (boolean value)
   */
  public submitEntity(entity: Entity, event: any): void {
    entity.selected = event;
    if (entity.selected) {
      this.allFileValuesSelected.forEach((e: Entity): void => {
        if (e.name == entity.name) {
          e.selected = entity.selected;
        }
      });
    }
  }

  /**
   * Submit the selected entity value
   * @param entity the entity value
   * @param event the event (boolean value)
   */
  public submitValue(entity: Entity, event: any): void {
    entity.selected = event;
    if (event == false) {
      this.allFileEntitiesSelected.forEach((e: Entity): void => {
        if (e.name == entity.name) {
          e.selected = entity.selected;
        }
      });
    }
  }

  /**
   * Handle the choice container
   * @param container the container
   */
  public onContainerClicked(container: any): void {
    if (container != null && container.status) {
      this.selectedContainer = container;
      this.haveChoiceContainer = true;
      this.preBuildGraph();
    }
  }

  /**directory
   * Handle the choice container
   * @param directory the directory
   */
  public onDirectoryClicked(directory: any): void {
    if (directory != null) {
      this.selectedDirectory = directory;
      this.haveChoiceDirectory = true;
      this.preBuildGraph();
    }
  }

  public getContainerDirectories(): void {
    if (this.selectedContainer.directories.length == 0) {
      this.dockerService.containerDirectories(this.selectedContainer.id).subscribe({
        next: responseData => {
          let response: any;
          response = responseData;
          if (response['http_status_code'] == 200 && response['response_data'] != null) {
            let dockerFolders: any;
            response.response_data['directories'].forEach((item: any): void => {
              this.selectedContainer.directories.push(item);
            });
          } else {
            this.messageService.show('Unable to load Container directories. Retry', false, 2000);
          }
        }, error: errorData => {
          this.messageService.show('Unable to load Container directories. Retry', false, 2000);
        }, complete: () => {
        }
      })
    }
  }

  // Show the Sidebar
  public showSidebar(): void {
    this.isShowSidebar = true;
  }

  // Show the card for choice container
  public showContainers(): void {
    if (this.creationMethod == "2") {
      if (this.dockerContainers.length == 0) {
        this.dockerService.containers().subscribe({
          next: responseData => {
            this.apiResponse = responseData;
            if (this.apiResponse['http_status_code'] == 200 && this.apiResponse['response_data'] != null) {
              this.apiResponse.response_data['all_containers'].forEach((item: any) => {
                let status = false;
                if (item.status == 'running') {
                  status = true;
                }
                let container = new Container(item.id, item.name, status, item.image);
                this.dockerContainers.push(container);
              });

              if (this.dockerContainers.length > 0) {
                this.isShowTable = false;
                this.isShowContainers = true;
              }
            } else {
              this.messageService.show('Unable to load Memgraph docker container. Please start Memgraph', false, 3000);
            }
          }, error: errorData => {
            this.apiResponse = errorData;
            this.messageService.show('Unable to load Memgraph docker container. Please start Memgraph', false, 3000);
          }, complete: () => {
          }
        });
      } else {
        this.isShowTable = false;
        this.isShowContainers = true;
      }
    } else {
      this.preBuildGraph();
    }
  }

  // Prepare to build graph
  public preBuildGraph(): void {
    if (!this.eventIdColumn || !this.timestampColumn || !this.activityNameColumn || this.getFilteredColumn().length === 0 || this.getFilteredValuesColumn().length === 0) {
      this.messageService.show('Please map the information.', false, 2000);
      return;
    }
    if (this.selectedFile) {
      const reader: FileReader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const csvData: string = e.target.result.toString();
          const lines = csvData.split('\n');
          if (lines.length > 0) {
            const header = lines[0].split(',');

            // Trova l'indice della colonna del timestamp
            const timestampIndex = header.indexOf(this.timestampColumn);

            /*if (timestampIndex === -1) {
              this.messageService.show('Timestamp column not found in the CSV file.', false, 2000);
              return;
            }*/

            // Aggiorna l'intestazione
            for (let i = 0; i < header.length; i++) {
              if (header[i] === this.eventIdColumn) {
                header[i] = 'event_id';
              } else if (header[i] === this.timestampColumn) {
                header[i] = 'timestamp';
              } else if (header[i] === this.activityNameColumn) {
                header[i] = 'activity_name';
              }
            }

            // Controlla i valori del timestamp
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(',');
              const timestampValue = values[timestampIndex];
              console.log('Timestamp value: ' + timestampValue);
            }

            lines[0] = header.join(',');
            const modifiedCSV = lines.join('\n');
            const modifiedFile: File = new File([new Blob([modifiedCSV], { type: 'text/csv' })], 'modified_data.csv', { type: 'text/csv' });
            this.buildGraph(modifiedFile);
          }
        }
      };
      reader.readAsText(this.selectedFile);
    } else {
      this.messageService.show('Please upload .csv file', false, 2000);
    }
  }


  /**
   * Build the standard Graph
   * @param file the csv file
   */
  public buildGraph(file: File): void {
    if (!file) {
      return;
    }
    const allFilteredColumn: string[] = this.getFilteredColumn();
    const allValuesColumn: string[] = this.getFilteredValuesColumn();

    let standardColumn: string[] = [this.eventIdColumn, this.timestampColumn, this.activityNameColumn];

    const formData: FormData = new FormData();
    formData.append('file', file, 'filtered.csv');
    formData.append('copy_file', file, 'filtered.csv');

    this.isShowSidebar = false;
    this.isLoadingProgressBar = true;
    try {
      let apiResponse: any = null;
      this.standardGraphService.createGraph(formData, this.creationMethod, standardColumn, allFilteredColumn, allValuesColumn, this.fixedColumn, this.variableColumn, this?.selectedContainer).subscribe({
        next: response => {
          apiResponse = response;
          console.log(apiResponse);
          if (apiResponse != null && apiResponse.http_status_code == 201) {
            this.removeStandardProperties();
            this.supportService.setFilteredColumn(this.filteredColumn);
            this.getGraph();
            return;
          }
        }, error: error => {
          apiResponse = error;
          this.messageService.show('Error while creatin the Graph. Retry', false, 3000);
          this.isLoadingProgressBar = false;
          this.resetCSVData();
          return;

        }, complete: () => {
        }
      });
    } catch (error) {
      this.messageService.show('Internal Server Error. Retry', false, 2000);
      this.resetCSVData();
    }
  }

  /**
   * Retrieve the details information
   * for the new created Graphs
   */
  public async getGraph() {
    try {
      let apiResponse: any = null;

      this.standardGraphService.getGraphDetilsInfo().subscribe({
        next: responseData => {
          apiResponse = responseData;
          if (apiResponse.http_status_code === 200 && apiResponse.response_data != null) {
            this.standardGraphService.saveResponse(apiResponse.response_data);
            this.isLoadingProgressBar = false;
            this.messageService.show('The Graph was successfully created within the Memgraph Database', true, 3000);
            this.router.navigateByUrl('/details');
          }
        }, error: errorData => {
          apiResponse = errorData;
          this.messageService.show('Error receiving the created graph. Retry', false, 2000);
          this.resetCSVData();
        }, complete: () => { }
      });
    } catch (error) {
      this.messageService.show('Internal Server Error. Retry', false, 2000);
      this.resetCSVData();
    }
  }

  // Return the filtered .csv column choice by User.
  public getFilteredColumn(): string[] {
    return this.allFileEntitiesSelected
      .filter(column => column.selected)
      .map(column => column.name);
  }

  // Return the filtered values .csv column choice by User.
  public getFilteredValuesColumn(): string[] {
    return this.allFileValuesSelected
      .filter(column => column.selected)
      .map(column => column.name);
  }

  // Return the filtered values .csv column choice by User.
  public getAllFileEntities(): string[] {
    return this.allFileEntitiesSelected
      .filter(column => column.selected)
      .map(column => column.name);
  }

  // ------ SUPPORT METHODS ------

  // Close the Tutorial
  public terminateTutorial(): void {
    this.isTutorialTerminated = true;
    this.isShowUpload = true;
  }

  /**
   * Remove the standard properties (EventId, Timestamp, ActivityName)
   * from the entities column
   */
  public removeStandardProperties(): void {
    const elementsToRemove: string[] = [this.eventIdColumn, this.activityNameColumn, this.timestampColumn];
    this.filteredColumn = this.getFilteredColumn().filter(item => !elementsToRemove.includes(item));
  }

  // Delete the selected .csv file and reset files array
  public resetCSVData(): void {
    this.files = [];
    this.selectedFile = undefined;
  }

  // Handle the click for close tutorial
  public toggleTutorial(): void {
    this.isTutorialTerminated = true;
    this.isShowUpload = true;
  }

  // Handle the click for close table
  public toggleTable(): void {
    this.isShowTable = false;
    this.isShowUpload = true;
  }

  // Handle the click for close Sidebar
  public toggleSidebar(): void {
    this.isShowSidebar = false;
    this.allFileValuesSelected.forEach((e: Entity): void => {
      e.selected = false;
    });
    this.allFileEntitiesSelected.forEach((e: Entity): void => {
      e.selected = false;
    });
    this.eventIdColumn = '';
    this.timestampColumn = '';
    this.activityNameColumn = '';
  }

  // Handle the click for Help icon
  public toggleHelp(): void {
    this.dialog.open(HelpStandardDialogComponent);
  }

  public toggleCreationMethods(): void {
    this.dialog.open(HelpCreationDialogComponent);
  }
}
