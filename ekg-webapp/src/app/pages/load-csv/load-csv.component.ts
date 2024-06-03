import {Component, OnDestroy, OnInit} from '@angular/core';
import {Router} from "@angular/router";

// Components import
import {HelpStandardDialogComponent} from "../../components/help-standard-dialog/help-standard-dialog.component";

// Services import
import {NotificationService} from "../../services/notification.service";
import {StandardGraphService} from "../../services/standard_graph.service";
import {SupportDataService} from "../../services/support_data.service";

// Material import
import {MatDialog} from "@angular/material/dialog";

// Models import
import {Entity} from "../../core/models/entity.model";

// Other import
import {Papa} from "ngx-papaparse";
import {SocketService} from "../../core/services/socket.service";

@Component({
  selector: 'app-load-csv',
  templateUrl: './load-csv.component.html',
  styleUrl: './load-csv.component.scss'
})
export class LoadCsvComponent implements OnInit, OnDestroy {

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
  public allFileEntities: Entity [] = [];

  // All the .csv file values selected
  public allFileValuesSelected: Entity [] = [];

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
  public isTutorialTerminated: boolean = false

  // Show the upload area
  public isShowUpload: boolean = false;

  // Show the table (recap csv)
  public isShowTable: boolean = false;

  // Show the sidebar
  public isShowSidebar: boolean = false;

  // If the progress bar is loading or not
  public isLoadingProgressBar: boolean = false;

  public progressData: any;

  public completeData: any;

  public errorData: any;

  /**
   * Constructor for LoadCsvComponent component
   * @param router the Router
   * @param parser the Papa for parse .csv file
   * @param dialog the Material dialog
   * @param messageService the NotificationService service
   * @param standardGraphService the StandardGraphService service
   * @param supportService the SupportDataService service
   * @param socketService the SocketService service
   */
  constructor(
    private router: Router,
    private parser: Papa,
    private dialog: MatDialog,
    private messageService: NotificationService,
    private standardGraphService: StandardGraphService,
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
    this.allFileEntities = [];
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
      if (this.allFileEntities.length > 0 && this.dataSource.length > 0 && this.displayedColumns.length > 0) {
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
                this.allFileEntities = allColumn.map(columnName => ({name: columnName, selected: false}));
                this.allFileValuesSelected = allColumn.map(columnName => ({name: columnName, selected: false}));
                this.allFileEntities.forEach((item: Entity) => {
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
    this.allFileEntities.forEach((e: Entity) => {
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
      this.allFileEntities.forEach((e: Entity): void => {
        if (e.name == entity.name) {
          e.selected = entity.selected;
        }
      });
    }
  }

  // Show the Sidebar
  public showSidebar(): void {
    this.isShowSidebar = true;
  }

  // Prepare to build graph
  public preBuildGraph(): void {
    if (!this.eventIdColumn || !this.timestampColumn || !this.activityNameColumn || !this.fixedColumn || !this.variableColumn || this.getFilteredColumn().length == 0 || this.getFilteredValuesColumn().length == 0) {
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
            for (let i = 0; i < header.length; i++) {
              if (header[i] === this.eventIdColumn) {
                header[i] = 'event_id';
              } else if (header[i] === this.timestampColumn) {
                header[i] = 'timestamp';
              } else if (header[i] === this.activityNameColumn) {
                header[i] = 'activity_name';
              }
            }
            lines[0] = header.join(',');
            const modifiedCSV = lines.join('\n');
            const modifiedFile: File = new File([new Blob([modifiedCSV], {type: 'text/csv'})], 'modified_data.csv', {type: 'text/csv'});
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
    this.isShowSidebar = false;
    this.isLoadingProgressBar = true;
    const allFilteredColumn: string[] = this.getFilteredColumn();
    const allValuesColumn: string[] = this.getFilteredValuesColumn();
    const formData: FormData = new FormData();
    formData.append('file', file, 'filtered.csv');
    try {
      let apiResponse: any = null;
      this.standardGraphService.createGraph(formData, allFilteredColumn, allValuesColumn, this.fixedColumn, this.variableColumn).subscribe(
        response => {
          apiResponse = response;
          if (apiResponse != null && apiResponse.http_status_code == 201) {
            this.removeStandardProperties();
            this.supportService.setFilteredColumn(this.filteredColumn);
            this.getGraph();
            return;
          }
        },
        error => {
          apiResponse = error;
          this.messageService.show('Error while creatin the Graph. Retry', false, 3000);
          this.isLoadingProgressBar = false;
          this.isShowTable = false;
          this.isShowUpload = true;
          this.resetCSVData();
          return;

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

      this.standardGraphService.getGraphDetails().subscribe(
        (response): void => {
          apiResponse = response;
          if (apiResponse.http_status_code === 200 && apiResponse.response_data != null) {
            this.standardGraphService.saveResponse(apiResponse.response_data);
            this.isLoadingProgressBar = false;
            this.messageService.show('The Graph was successfully created within the Memgraph Database', true, 3000);
            this.router.navigateByUrl('/details');
          }
        },
        error => {
          apiResponse = error;
          this.messageService.show('Error receiving the created graph. Retry', false, 2000);
          this.resetCSVData();
        });
    } catch (error) {
      this.messageService.show('Internal Server Error. Retry', false, 2000);
      this.resetCSVData();
    }
  }

  // Return the filtered .csv column choice by User.
  public getFilteredColumn(): string[] {
    return this.allFileEntities
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
    return this.allFileEntities
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
    this.allFileEntities = [];
    this.allFileValuesSelected = [];
    this.selectedFile = undefined;
    this.hasSelectedFile = false;
    this.dataSource = [];
    this.displayedColumns = [];
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
  }

  // Handle the click for Help icon
  public toggleHelp(): void {
    this.dialog.open(HelpStandardDialogComponent);
  }
}
