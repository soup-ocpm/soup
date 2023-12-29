import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Papa } from 'ngx-papaparse';
import { Router } from '@angular/router';
import { GraphService } from '../../services/graph.service';
import { GraphDataService } from 'src/app/services/graph.data.service';


@Component({
  selector: 'app-load-page',
  templateUrl: './load-page.component.html',
  styleUrls: ['./load-page.component.scss']
})
export class LoadPageComponent implements OnInit, OnDestroy {

  /**
   * Boolean variable that indicate if the tutoria
   * is finished.
   */
  isTutorialTerminated: boolean | undefined;

  // Files
  files: File[] = [];

  // The only .csv file
  selectedFile: File | undefined;

  // All keys (column) inside the file .csv
  allColumnFile: { name: string; selected: boolean }[] = [];

  /**
   * Boolean variable that indicate if there is 
   * 1 selecte file.
   */
  haveFile: boolean | undefined;

  /**
   * Boolean variable that indicate if the 
   * snackbar is showed or not.
   */
  showSidebar: boolean | undefined;

  // Associate Http response.
  responseCall: any;

  /**
   * Boolean variable that indicate if is 
   * showing progress bar.
   */
  isLoadingProgressBar: boolean | undefined;

  // Filtered column choiched by User 
  filteredColumn: string[] = []

  // Event id column name map from User
  eventIdColumn: string = '';

  // Timestamp column name map from User
  timestampColumn: string = '';

  // Activity Name column name map from User
  activityNameColumn: string = '';


  /**
   * Constructor class for LoadPageComponent
   * @param papa the papa library
   * @param snackBar the MatSnackBar
   * @param serviceCall the service call
   * @param serviceData the service data
   * @param router the Router
   */
  public constructor(
    private papa: Papa,
    private snackBar: MatSnackBar,
    private serviceCall: GraphService,
    private serviceData: GraphDataService,
    private router: Router
  ) { }


  //NgOnInit implementation method.
  public ngOnInit(): void {
    this.isTutorialTerminated = false;
    this.haveFile = false;
    this.showSidebar = false;
    this.isLoadingProgressBar = false;
  }


  // NgOnDestroy implementation method.
  public ngOnDestroy(): void {
    this.resetCSVData();
    this.responseCall = undefined;
  }


  /**
   * Method that allow to get file (1 file .csv)
   * from User computer.
   * @param event the event (get file)
   */
  public onSelect(event: any) {
    if (event.addedFiles.length != 1) {
      this.openSnackBar('Only 1 file.', 'Done');
      return;
    }
    if (this.files.length == 0) {
      this.files.push(...event.addedFiles);
      if (!this.files[0].name.endsWith('.csv')) {
        this.files.splice(this.files.indexOf(event), 1);
        this.selectedFile = undefined;
        this.openSnackBar('Only file with .csv extension', 'Retry');
        return;
      }
      this.selectedFile = this.files[0];
      this.haveFile = true;
    } else {
      this.openSnackBar('Only 1 file.', 'Done');
    }
  }


  /**
   * Method that remove selected file from dropzone.
   * @param event the event (remove file)
   */
  public onRemove(event: any) {
    this.files.splice(this.files.indexOf(event), 1);
    if (this.files.length == 0) {
      this.haveFile = false;
    }
    this.selectedFile = undefined;
  }


  /**
   * Method that parse the .csv selected file for get
   * all Columns
   */
  public parseCSV() {
    if (this.selectedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const csvData = e.target.result.toString();

          this.papa.parse(csvData, {
            complete: (result) => {
              const headerRow = result.data[0];
              const allColumn = Object.keys(headerRow);
              if (allColumn.length > 0) {
                this.allColumnFile = allColumn.map(columnName => ({ name: columnName, selected: false }));
                this.showSidebar = true;
              }
            },
            header: true
          });
        }
      };
      reader.readAsText(this.selectedFile);
    } else {
      this.openSnackBar('Upload .csv file.', 'Done');
    }
  }


  /**
   * Method that change name of the csv by the 
   * user choice.
  */
  public preBuildGraph() {
    if (!this.eventIdColumn || !this.timestampColumn || !this.activityNameColumn) {
      this.openSnackBar('Please select all columns (Event ID, Timestamp, Activity Name).', 'Done');
      return;
    }
    if (this.selectedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const csvData = e.target.result.toString();
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
            const modifiedFile = new File([new Blob([modifiedCSV], { type: 'text/csv' })], 'modified_data.csv', { type: 'text/csv' });
            this.buildGraph(modifiedFile);
          }
        }
      };
      reader.readAsText(this.selectedFile);
    } else {
      this.openSnackBar('Upload .csv file.', 'Done');
    }
  }


  // Method that call Backend for create new Graph by .csv file.
  public async buildGraph(file: File) {
    if (!file) {
      return;
    }

    this.showSidebar = false;
    this.isLoadingProgressBar = true;
    const allFilteredColumn = this.getFilteredColumn();
    const formData = new FormData();
    formData.append('file', file, 'filtered.csv');

    try {
      const response = await this.serviceCall.createStandardGraph(formData, allFilteredColumn).toPromise();
      if (!response) {
        this.openSnackBar('Error while upload file.', 'Retry');
        this.resetCSVData();
        return;
      }
      this.responseCall = response;
      switch (this.responseCall.status) {
        case 200: {
          this.removeStandardProperties();
          this.serviceData.setFilteredColumn(this.filteredColumn);
          await this.getGraph();
          return;
        }
        case 400: {
          this.openSnackBar('Error file extension.', 'Retry');
          this.resetCSVData();
          return;
        }
      }
    } catch (error) {
      this.openSnackBar(`Internal Server Error.`, 'Retry');
      this.resetCSVData();
    } finally {
      this.isLoadingProgressBar = false;
    }
  }


  // Method that get all data (Nodes, Edges...) of new Graph.
  public async getGraph() {
    await new Promise(resolve => setTimeout(resolve, 3000));
    try {
      const response = await this.serviceCall.getStandardGraph().toPromise();
      // Rieffettuare chiamata.
      this.responseCall = response;
      if (this.responseCall.status === 200) {
        this.serviceCall.saveResponse(this.responseCall);
        this.isLoadingProgressBar = false;
        this.router.navigateByUrl('/graph');
      }
    } catch (error) {
      this.openSnackBar(`Error : ${this.responseCall}`, 'Retry');
    } finally {
      this.isLoadingProgressBar = false;
    }
  }


  // Method that return the filtered .csv column choiced by User.
  public getFilteredColumn() {
    return this.allColumnFile
      .filter(column => column.selected)
      .map(column => column.name);
  }


  // ----------SUPPORT METHOD-------------------


  // Open side bar
  public openSidebar() {
    this.showSidebar = true;
  }


  // Close side bar and clear data
  public closeSidebar() {
    this.showSidebar = false;
    this.allColumnFile = [];
  }


  // Delete the selected .csv file and reset files array
  public resetCSVData() {
    this.files = [];
    this.selectedFile = undefined;
    this.allColumnFile = [];
    this.haveFile = false;
    this.isLoadingProgressBar = false;
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
   * Remove the standar properties (EventId, Timestamp, ActivityName)
   * from the filtered columns
   */
  public removeStandardProperties() {
    const elementsToRemove = [this.eventIdColumn, this.activityNameColumn, this.timestampColumn];
    this.filteredColumn = this.getFilteredColumn().filter(item => !elementsToRemove.includes(item));
  }
}