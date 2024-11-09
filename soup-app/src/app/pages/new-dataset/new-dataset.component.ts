// eslint-disable-next-line simple-import-sort/imports
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatStepper } from '@angular/material/stepper';
import { Router } from '@angular/router';
import { NgxDropzoneModule } from 'ngx-dropzone';
import { Papa } from 'ngx-papaparse';

import { ContainerListCardComponent } from '../../components/container-list-card/container-list-card.component';
import { SButtonTComponent } from '../../core/components/s-buttons/s-button-t/s-button-t.component';
import { SButtonComponent } from '../../core/components/s-buttons/s-button/s-button.component';
import { SProgressbarComponent } from '../../core/components/s-progressbar/s-progressbar.component';
import { SSpinnerOneComponent } from '../../core/components/s-spinners/s-spinner-one/s-spinner-one.component';
import { ToastLevel } from '../../core/enums/toast_type.enum';
import { LoggerService } from '../../core/services/logger.service';
import { ModalService } from '../../core/services/modal.service';
import { NotificationService } from '../../core/services/toast.service';
import { Container } from '../../models/docker_container.model';
import { Entity } from '../../models/entity.mode';
import { DatasetService } from '../../services/datasets.service';
import { DockerService } from '../../services/docker_container.service';
import { StandardGraphService } from '../../services/standard_graph.service';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

@Component({
  selector: 'app-new-dataset',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    // Application module
    MaterialModule,
    MatRadioModule,
    // Application component
    SButtonComponent,
    SButtonTComponent,
    SProgressbarComponent,
    SSpinnerOneComponent,
    ContainerListCardComponent,
    // Other
    NgxDropzoneModule
  ],
  templateUrl: './new-dataset.component.html',
  styleUrl: './new-dataset.component.scss'
})
export class NewDatasetComponent {
  // List of files
  public files: File[] = [];

  // The selected file
  public selectedFile: File | undefined;

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
  public eventIdColumn = '';

  // Timestamp of the event id entity
  public timestampColumn = '';

  // Activity name of the event id entity
  public activityNameColumn = '';

  // The fixed column
  public fixedColumn = '';

  // The variable column
  public variableColumn = '';

  // All the docker containers
  public dockerContainers: Container[] = [];

  // The search container
  public searchTerm = '';

  // The selected container
  public selectedContainer: Container | any;

  // If the user choice the container
  public haveChoiceContainer = false;

  // If the user upload his file
  public haveSelectFile = false;

  // If the tutorial is show or not
  public isShowTutorial = true;

  // If the upload drag&drop is show or not
  public isShowUpload = false;

  // If the table is show or not
  public isShowTable = false;

  // If the table is full screen
  public isShowFullScreen = false;

  // If the sidebar is show or not
  public isShowSidebar = false;

  // If the containers are show or not
  public isShowContainers = false;

  // If the progress bar is show or not
  public isLoading = false;

  // Loading the container
  public isLoadingContainer = false;

  // The creation methods for graph (standard or LOAD)
  public creationMethod = '2';

  // The progress data
  public progressData: any;

  /**
   * Constructor for NewDatasetComponent component
   * @param router the Router
   * @param parser the Papa parser
   * @param modal the ModalService service
   * @param toast the NotificationService service
   * @param dockerService the DockerService service
   * @param datasetService the DatasetService service
   * @param supportService the LocalDataService service
   * @param graphService the StandardGraphService service
   */
  constructor(
    private router: Router,
    private parser: Papa,
    private modal: ModalService,
    private toast: NotificationService,
    private logger: LoggerService,
    private dockerService: DockerService,
    private datasetService: DatasetService,
    private supportService: LocalDataService,
    private graphService: StandardGraphService
  ) {}

  /**
   * Handle the selection file
   * @param event the event of upload file
   */
  public onSelectFile(event: any): void {
    if (event.addedFiles.length != 1) {
      this.toast.show('Only one file can be uploaded', ToastLevel.Error, 2000);
      return;
    }
    if (this.files.length > 0) {
      this.files = [];
    }

    this.files.push(...event.addedFiles);
    if (!this.files[0].name.endsWith('.csv')) {
      this.files.splice(this.files.indexOf(event), 1);
      this.selectedFile = undefined;
      this.toast.show('Only file with CSV extension', ToastLevel.Error, 2000);
      return;
    }
    this.selectedFile = this.files[0];
    this.haveSelectFile = true;
  }

  /**
   * Parse the csv file
   */
  public parseFileData(): void {
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
                // Preparazione delle colonne della tabella
                this.displayedColumns = allColumn;
                this.allFileEntitiesSelected = allColumn.map((columnName) => ({ name: columnName, selected: false }));
                this.allFileValuesSelected = allColumn.map((columnName) => ({ name: columnName, selected: false }));

                this.dataSource = result.data.slice(0, 1000);

                this.isShowUpload = false;
                this.isShowTable = true;
                this.isShowSidebar = true;
              }
            },
            header: true
          });
        }
      };
      reader.readAsText(this.selectedFile);
    } else {
      this.toast.show('Upload the csv file', ToastLevel.Error, 2000);
    }
  }

  /**
   * Reset the csv file data
   */
  public resetFileData(): void {
    this.files = [];
    this.selectedFile = undefined;
    this.haveSelectFile = false;
  }

  /**
   * Remove the file
   * @param event the event
   */
  public removeFile(event: any): void {
    this.files.splice(this.files.indexOf(event), 1);
    if (this.files.length == 0) {
      this.haveSelectFile = false;
    }
    this.selectedFile = undefined;
  }

  /**
   * Check the selected entity
   * @param entity the entity
   */
  public checkSelectedEntity(entity: string): boolean {
    return this.allFileEntitiesSelected.some((e: Entity) => e.name === entity && e.selected);
  }

  /**
   * Check the selected entity
   * @param entity the entity
   */
  public checkSelectedElement(entity: string): boolean {
    return this.allFileValuesSelected.some((e: Entity) => e.name === entity && e.selected && !this.checkSelectedEntity(entity));
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
   * Change the information
   * @param event the Event
   * @param type the type
   */
  public onSelectionChange(event: Event, type: string): void {
    const selectElement = event.target as HTMLSelectElement;
    if (selectElement != null) {
      const value = selectElement.value;
      switch (type) {
        case 'event':
          this.eventIdColumn = value;
          break;
        case 'activity':
          this.activityNameColumn = value;
          break;
        case 'time':
          this.timestampColumn = value;
          break;
      }
    }
  }

  /**
   * Return the filtered .csv column choice
   * @returns an array of string that represent the
   * csv column choiced
   */
  public getFilteredColumn(): string[] {
    return this.allFileEntitiesSelected.filter((column) => column.selected).map((column) => column.name);
  }

  /**
   * Return the filtered values .csv column choice
   * @returns an array of string that represent the
   * csv values choiced
   */
  public getFilteredValuesColumn(): string[] {
    if (this.eventIdColumn == '') {
      this.eventIdColumn = this.allFileEntitiesSelected[0].name;
    }
    return this.allFileValuesSelected.filter((column) => column.selected).map((column) => column.name);
  }

  /**
   * Return the filtered entity .csv column choice
   * @returns an array of string that represent the
   * csv entity choiced
   */
  public getAllFileEntities(): string[] {
    return this.allFileEntitiesSelected.filter((column) => column.selected).map((column) => column.name);
  }

  /**
   * Handle the back button on Stepper
   * @param stepper the MatStepper stepper
   */
  public goBackStepper(stepper: MatStepper): void {
    stepper.previous();
  }

  /**
   * Handle the next button on Stepper
   * @param stepper the MatStepper stepper
   */
  public goForwardStepper(stepper: MatStepper): void {
    stepper.next();
  }

  /**
   * Open the Help dialog
   */
  public openHelpDialog(): void {
    // TODO: implement
  }

  /**
   * Open the second help dialog
   */
  public openHelpCreationMethods(): void {
    // TODO: implement
  }

  /**
   * Retrieve all available docker
   * containers
   */
  public getDockerContainers(): void {
    this.isLoadingContainer = true;

    if (this.dockerContainers.length == 0) {
      this.dockerService.containers().subscribe({
        next: (responseData) => {
          if (responseData.statusCode == 200 && responseData.responseData != null) {
            const allContainers = responseData.responseData['all_containers'];
            allContainers.forEach((item: any) => {
              let status = false;
              if (item.status == 'running') {
                status = true;
              }
              const container = new Container();
              container.id = item.id;
              container.name = item.name;
              container.image = item.image;
              container.status = status;
              this.dockerContainers.push(container);
            });

            if (this.dockerContainers.length > 0) {
              this.isShowTable = false;
              this.isShowContainers = true;
            }

            this.isLoadingContainer = false;
          } else {
            this.isLoadingContainer = false;
            this.toast.show('Unable to load Docker containers. Please start Docker Engine', ToastLevel.Error, 3000);
          }
        },
        error: (errorData) => {
          const apiResponse: any = errorData;
          if (apiResponse['statusText'] == 'Unknown Error') {
            this.toast.show('Unable to load Docker containers. Please start the Engine', ToastLevel.Error, 3000);
          } else {
            this.toast.show('Unable to load Docker containers. Please start Docker Engine', ToastLevel.Error, 3000);
          }

          this.isLoadingContainer = false;
        },
        complete: () => {}
      });
    } else {
      this.isShowTable = false;
      this.isShowContainers = true;
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
      this.inputDatasetName();
    }
  }

  /**
   * Filter the containers based on the input
   * @returns the filtered containers
   */
  public filteredContainers() {
    if (!this.searchTerm) {
      return this.dockerContainers;
    }

    return this.dockerContainers.filter((container) => container.name.toLowerCase().includes(this.searchTerm.toLowerCase()));
  }

  /**
   * Open the modal for input dataset
   * name and description
   */
  public inputDatasetName(): void {
    this.modal.showInputModal(
      'Dataset Information',
      'Please enter the Dataset information',
      true,
      'Build',
      '#FFAC1C',
      'Close',
      '#6c757d',
      this.selectedContainer.id,
      (datasetName: string, datasetDescription: string, saveProcessExecution: boolean) => {
        return this.retrieveModalData(datasetName, datasetDescription, saveProcessExecution);
      },
      () => {
        this.modal.hideInputModal();
      }
    );
  }

  /**
   * Catch the dataset input information
   * @param datasetName the dataset name
   * @param datasetDescription the dataset informaton
   * @param saveProcessExecution if the user want to save the
   * timestamp execution
   */
  private retrieveModalData(datasetName: string, datasetDescription: string, saveProcessExecution: boolean): Promise<void> {
    this.prepareBuild(datasetName, datasetDescription, saveProcessExecution);
    return Promise.resolve();
  }

  /**
   * Prepare to buil the graph
   * @param datasetName the dataset name
   * @param datasetDescription the dataset description
   * @param saveProcessExecution if the user want to save
   * the timestamp execution
   */
  public prepareBuild(datasetName: string, datasetDescription: string, saveProcessExecution: boolean): void {
    if (
      !this.eventIdColumn ||
      !this.timestampColumn ||
      !this.activityNameColumn ||
      this.getFilteredColumn().length === 0 ||
      this.getFilteredValuesColumn().length === 0
    ) {
      this.toast.show('Please map the information.', ToastLevel.Error, 2000);
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

            /*if (timestampIndex === -1) {
              this.messageService.show('Timestamp column not found in the CSV file.', false, 2000);
              return;
            }*/

            // Update columns
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
            const modifiedFile: File = new File([new Blob([modifiedCSV], { type: 'text/csv' })], 'modified_data.csv', { type: 'text/csv' });

            this.graphService.deleteGraph().subscribe({
              next: () => {
                this.buildDataset(modifiedFile, datasetName, datasetDescription, saveProcessExecution);
              },
              error: () => {
                this.toast.show('Temporal error. Check the Engine and Retry', ToastLevel.Error, 3000);
              },
              complete: () => {}
            });
          }
        }
      };
      reader.readAsText(this.selectedFile);
    } else {
      this.toast.show('Please upload .csv file', ToastLevel.Error, 2000);
    }
  }

  /**
   * Build the dataset
   * @param file the file
   * @param datasetName the dataset name
   * @param datasetDescription the dataset description
   * @param saveProcessExecution if the user want to save
   * the timestamp execution
   */
  public buildDataset(file: File, datasetName: string, datasetDescription: string, saveProcessExecution: boolean): void {
    if (!file) {
      return;
    }
    const allFilteredColumn: string[] = this.getFilteredColumn();
    const allValuesColumn: string[] = this.getFilteredValuesColumn();

    const standardColumn: string[] = [this.eventIdColumn, this.timestampColumn, this.activityNameColumn];

    const formData: FormData = new FormData();
    formData.append('file', file, 'filtered.csv');
    formData.append('copy_file', file, 'filtered.csv');

    this.isShowContainers = false;
    this.isLoading = true;

    try {
      this.graphService
        .createGraph(
          formData,
          datasetName,
          datasetDescription,
          saveProcessExecution,
          this.creationMethod,
          standardColumn,
          allFilteredColumn,
          allValuesColumn,
          this.fixedColumn,
          this.variableColumn,
          this?.selectedContainer
        )
        .subscribe({
          next: (response) => {
            if (response.statusCode == 201) {
              this.removeStandardProperties();
              this.supportService.setFilteredColumn(this.filteredColumn);
              this.getDataset(datasetName);
            }
          },
          error: () => {
            this.toast.show('Error while creatin the Graph. Retry', ToastLevel.Error, 3000);
            this.isLoading = false;
          },
          complete: () => {}
        });
    } catch (error) {
      this.toast.show(`Internal Server Error: ${error}`, ToastLevel.Error, 2000);
      this.resetFileData();
    }
  }

  /**
   * Retrieve the dataset by the name
   * @param datasetName the dataset name
   */
  public getDataset(datasetName: string): void {
    this.datasetService.getDataset(this.selectedContainer!.id, datasetName).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;
          const dataset = this.supportService.parseItemToDataset(this.selectedContainer!.id, data);
          if (dataset != null) {
            this.isLoading = false;
            this.supportService.setCurrentDataset(dataset);
            this.toast.show('Dataset created successfully', ToastLevel.Success, 3000);
            this.router.navigate(['/datasets', dataset.name]);
          }
        } else {
          this.isLoading = false;
          this.toast.show('Unable to retrieve the Dataset. Retry', ToastLevel.Error, 3000);
        }
      },
      error: (error) => {
        const errorData: any = error;
        this.logger.error(errorData);
        this.isLoading = false;
        this.toast.show('Unable to retrieve the Dataset. Retry', ToastLevel.Error, 3000);
      },
      complete: () => {}
    });
  }

  /**
   * Remove the standard properties (EventId, Timestamp, ActivityName)
   * from the entities column
   */
  public removeStandardProperties(): void {
    const elementsToRemove: string[] = [this.eventIdColumn, this.activityNameColumn, this.timestampColumn];
    this.filteredColumn = this.getFilteredColumn().filter((item) => !elementsToRemove.includes(item));
  }

  /**
   * Close the tutorial
   */
  public toggleTutorial(): void {
    this.isShowTutorial = false;
    this.isShowUpload = true;
  }

  /**
   * Close the Sidebar
   */
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

  /**
   * Open table in full-screen mode
   */
  public handleFullScreen(): void {
    this.isShowFullScreen = true;
    if (this.isShowSidebar) {
      this.isShowSidebar = false;
    }
  }

  /**
   * Close the table full-screen mode
   */
  public toggleFullScreen(): void {
    this.isShowFullScreen = false;
    this.isShowSidebar = !this.isShowSidebar;
  }
}
