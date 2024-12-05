// eslint-disable-next-line simple-import-sort/imports
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatStepper } from '@angular/material/stepper';
import { Router } from '@angular/router';
import { NgxDropzoneModule } from 'ngx-dropzone';
import { Papa } from 'ngx-papaparse';

import { UMLEdge } from '../../components/uml-diagram/models/uml_edge';
import { UMLNode } from '../../components/uml-diagram/models/uml_node';
import { UmlDiagramComponent } from '../../components/uml-diagram/uml-diagram.component';
import { SButtonTComponent } from '../../core/components/s-buttons/s-button-t/s-button-t.component';
import { SButtonComponent } from '../../core/components/s-buttons/s-button/s-button.component';
import { SProgressbarComponent } from '../../core/components/s-progressbar/s-progressbar.component';
import { ToastLevel } from '../../core/enums/toast_type.enum';
import { LoggerService } from '../../core/services/logger.service';
import { ModalService } from '../../core/services/modal.service';
import { NotificationService } from '../../core/services/toast.service';
import { Entity } from '../../models/entity.mode';
import { DatasetService } from '../../services/datasets.service';
import { StandardGraphService } from '../../services/standard_graph.service';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

// Multiplicity model
class Multiplicity {
  // The column one
  columnOne = '';

  // The multiplicity
  multiplicityOne = '';

  // The column two
  columnTwo = '';

  // The multiplicity
  multiplicityTwo = '';

  // The global and final multiplicity
  globalMultiplicity = '';
}

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
    UmlDiagramComponent,
    // Other
    NgxDropzoneModule,
    UmlDiagramComponent
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

  // All the csv columns
  public allColumns: string[] = [];

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

  // The trigger and target rows
  public triggerTargetRows: { trigger: string; target: string }[] = [{ trigger: '', target: '' }];

  // The search container
  public searchTerm = '';

  // If the user upload his file
  public haveSelectFile = false;

  // The nodes for the uml
  public umlNodes: UMLNode[] = [];

  // The edges for the uml
  public umlEdges: UMLEdge[] = [];

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

  // If the UML is show or not
  public isShowUML = false;

  // If the sidebar for uml class diagram is show
  public isShowUMLSidebar = false;

  // If the progress bar is show or not
  public isLoading = false;

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
   * @param logger the LoggerService service
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
    private modalService: ModalService,
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
   * Convert timestamp format
   * @param value the value
   */
  private convertTimestampFormat(value: string): string {
    return value.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/, '$1.$2');
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
              this.allColumns = allColumn;

              if (allColumn.length > 0) {
                // Preparazione delle colonne della tabella
                this.displayedColumns = allColumn;
                this.allFileEntitiesSelected = allColumn.map((columnName) => ({ name: columnName, selected: false }));
                this.allFileValuesSelected = allColumn.map((columnName) => ({ name: columnName, selected: false }));

                // Trasforma i dati del timestamp
                this.dataSource = result.data.map((row: any) => {
                  const modifiedRow = { ...row };
                  for (const key in modifiedRow) {
                    if (typeof modifiedRow[key] === 'string') {
                      modifiedRow[key] = this.convertTimestampFormat(modifiedRow[key]);
                    }
                  }
                  return modifiedRow;
                });

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
   * Return the entities trigger
   */
  public getAllTriggerEntities(): string[] {
    return this.umlNodes.filter((node) => node.label).map((node) => node.label);
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
   * Request to the user if he want to
   * map the trigger and target information
   */
  public requestTriggerAndTarget(): void {
    this.modalService.showGenericModal(
      'Trigger and Target?',
      'Do you want to map information about trigger and target',
      true,
      'Yes',
      '#ffac1c',
      'No',
      '#000000',
      () => this.createUMLDiagram(),
      () => {
        this.modalService.hideGenericModal();
        this.inputDatasetName();
      }
    );
  }

  /**
   * Calculate the moltiplicity between two columns
   * @param column1 the column1
   * @param column2 the column2
   */
  public calculateMultiplicity(column1: string, column2: string): Multiplicity {
    const multiplicity = new Multiplicity();

    if (!this.dataSource || this.dataSource.length === 0) {
      multiplicity.columnOne = column1;
      multiplicity.multiplicityOne = '0';
      multiplicity.columnTwo = column2;
      multiplicity.multiplicityTwo = '0';
      multiplicity.globalMultiplicity = '0';
      return multiplicity;
    }

    const mapColumn1ToColumn2: Record<string, Set<string>> = {};
    const mapColumn2ToColumn1: Record<string, Set<string>> = {};

    // Create the map
    this.dataSource.forEach((row: any) => {
      const value1 = row[column1];
      const value2 = row[column2];

      if (value1) {
        if (!mapColumn1ToColumn2[value1]) {
          mapColumn1ToColumn2[value1] = new Set();
        }
        mapColumn1ToColumn2[value1].add(value2);
      }

      if (value2) {
        if (!mapColumn2ToColumn1[value2]) {
          mapColumn2ToColumn1[value2] = new Set();
        }
        mapColumn2ToColumn1[value2].add(value1);
      }
    });

    // Determinate the multiplicity
    const multiplicityOne =
      Object.keys(mapColumn1ToColumn2).length === 0 ? '0' : Object.values(mapColumn1ToColumn2).some((set) => set.size > 1) ? 'N' : '1';

    const multiplicityTwo =
      Object.keys(mapColumn2ToColumn1).length === 0 ? '0' : Object.values(mapColumn2ToColumn1).some((set) => set.size > 1) ? 'N' : '1';

    multiplicity.columnOne = column1;
    multiplicity.multiplicityOne = multiplicityOne;
    multiplicity.columnTwo = column2;
    multiplicity.multiplicityTwo = multiplicityTwo;

    if (multiplicityOne === 'N' || multiplicityTwo === 'N') {
      multiplicity.globalMultiplicity = 'N a N';
    }
    if (multiplicityOne === '1' && multiplicityTwo === 'N') {
      multiplicity.globalMultiplicity = '1 a N';
    }
    if (multiplicityOne === 'N' && multiplicityTwo === '1') {
      multiplicity.globalMultiplicity = 'N a 1';
    } else {
      multiplicity.globalMultiplicity = '1 a 1';
    }

    return multiplicity;
  }

  /**
   * Calculate the moltiplicities between csv columns for trigger and target
   */
  private calculateAllMultiplicities(): Multiplicity[] {
    const filteredColumn: string[] = this.getFilteredColumn();
    const standardColumn: string[] = [this.eventIdColumn, this.timestampColumn, this.activityNameColumn];

    if (!this.dataSource || this.dataSource.length === 0 || !filteredColumn || filteredColumn.length < 2) {
      return [];
    }

    // Exclude standard columns
    const excludedColumns = ['event_id', 'timestamp', 'activity_name', ...standardColumn];
    const currentColumns = filteredColumn.filter((column) => !excludedColumns.includes(column));

    if (currentColumns.length < 2) {
      return [];
    }

    const result: Multiplicity[] = [];
    const seenPairs = new Set<string>();

    // Iteration
    for (let i = 0; i < currentColumns.length; i++) {
      for (let j = i + 1; j < currentColumns.length; j++) {
        const column1 = currentColumns[i];
        const column2 = currentColumns[j];

        // Calculate multiplicity for this columns pair
        const multiplicity = this.calculateMultiplicity(column1, column2);

        const pairKey = this.generateSymmetricKey(column1, column2, multiplicity.globalMultiplicity);
        if (seenPairs.has(pairKey)) {
          continue;
        }

        // Add multiplicity
        result.push(multiplicity);
        seenPairs.add(pairKey);
      }
    }

    return result;
  }

  /**
   * Generate unique key for the symmetric relationships
   * @param column1 the first column
   * @param column2 the second column
   * @param globalMultiplicity global rel
   */
  private generateSymmetricKey(column1: string, column2: string, globalMultiplicity: string): string {
    const sortedColumns = [column1, column2].sort(); // Ordina alfabeticamente le colonne
    return `${sortedColumns[0]}-${sortedColumns[1]}-${globalMultiplicity}`;
  }

  /**
   * Create and display the uml diagram
   */
  public createUMLDiagram(): void {
    const multiplicities = this.calculateAllMultiplicities();

    if (multiplicities.length === 0 || multiplicities == null) {
      this.inputDatasetName();
    } else {
      const nodeSet = new Set<string>();
      const edges: UMLEdge[] = [];

      multiplicities.forEach((multiplicity) => {
        const nodeOne: UMLNode = {
          id: multiplicity.columnOne,
          label: multiplicity.columnOne
        };

        const nodeTwo: UMLNode = {
          id: multiplicity.columnTwo,
          label: multiplicity.columnTwo
        };

        // CCreate unique string
        const nodeOneKey = `${nodeOne.id}:${nodeOne.label}`;
        const nodeTwoKey = `${nodeTwo.id}:${nodeTwo.label}`;

        //  Add node
        if (!nodeSet.has(nodeOneKey)) {
          nodeSet.add(nodeOneKey);
        }

        if (!nodeSet.has(nodeTwoKey)) {
          nodeSet.add(nodeTwoKey);
        }

        edges.push({
          source: multiplicity.columnOne,
          target: multiplicity.columnTwo,
          multiplicity: {
            left: multiplicity.multiplicityOne,
            right: multiplicity.multiplicityTwo
          }
        });
      });

      const nodes = Array.from(nodeSet).map((key) => {
        const [id, label] = key.split(':');
        return { id, label };
      });

      if (nodes != null && nodes.length > 0 && edges != null && edges.length > 0) {
        this.umlNodes = nodes;
        this.umlEdges = edges;

        this.isShowTable = false;
        this.isShowSidebar = false;
        this.isShowUML = true;
        this.isShowUMLSidebar = true;
      }
    }
  }

  /**
   * Add new trigger and target row
   */
  public addTriggerTargetRow(): void {
    this.triggerTargetRows.push({ trigger: '', target: '' });
  }

  /**
   * Remove specific trigger and target row
   */
  public removeTriggerTargetRow(index: number): void {
    this.triggerTargetRows.splice(index, 1);
  }

  /**
   * Handle the back button
   */
  public closeUMLLayout(): void {
    this.umlNodes = [];
    this.umlEdges = [];
    this.isShowUML = false;
    this.isShowUMLSidebar = false;
    this.isShowTable = true;
    this.isShowSidebar = true;
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

            const timestampIndex = header.findIndex((col) => col === this.timestampColumn);
            for (let i = 0; i < header.length; i++) {
              if (header[i] === this.eventIdColumn) {
                header[i] = 'event_id';
              } else if (header[i] === this.timestampColumn) {
                header[i] = 'timestamp';
              } else if (header[i] === this.activityNameColumn) {
                header[i] = 'activity_name';
              }
            }

            // Modifica le righe per convertire i timestamp
            for (let i = 1; i < lines.length; i++) {
              const row = lines[i].split(',');
              if (timestampIndex !== -1 && row[timestampIndex]) {
                row[timestampIndex] = this.convertTimestampFormat(row[timestampIndex]);
              }
              lines[i] = row.join(',');
            }

            const modifiedCSV = lines.join('\n');
            const modifiedFile: File = new File([new Blob([modifiedCSV], { type: 'text/csv' })], 'modified_data.csv', { type: 'text/csv' });

            this.graphService.deleteGraph().subscribe({
              next: () => {
                this.buildDataset(modifiedFile, datasetName, datasetDescription, saveProcessExecution);
              },
              error: () => {
                this.toast.show('Temporal error. Check the Engine and Retry', ToastLevel.Error, 3000);
              }
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

    // Add trigger and target if exists
    if (this.triggerTargetRows.length > 0) {
      this.triggerTargetRows.forEach((item, index) => {
        formData.append(`trigger_${index}`, item.trigger);
        formData.append(`target_${index}`, item.target);
      });
    }

    const isShowUML = this.isShowUML && this.isShowUMLSidebar;

    if (isShowUML) {
      this.isShowUML = false;
      this.isShowUMLSidebar = false;
    }

    this.isLoading = true;
    try {
      this.graphService
        .createGraph(
          formData,
          datasetName,
          datasetDescription,
          saveProcessExecution,
          this.creationMethod,
          this.allColumns,
          standardColumn,
          allFilteredColumn,
          allValuesColumn
        )
        .subscribe({
          next: (response) => {
            if (response.statusCode == 201) {
              this.removeStandardProperties();
              this.supportService.setFilteredColumn(this.filteredColumn);
              this.getDataset(datasetName);
            } else if (response.statusCode == 400) {
              this.toast.show('Error while creatin the Graph. Retry', ToastLevel.Error, 3000);
              this.isLoading = false;

              if (isShowUML) {
                this.isShowUML = true;
                this.isShowUMLSidebar = true;
              }
            }
          },
          error: () => {
            this.toast.show('Error while creatin the Graph. Retry', ToastLevel.Error, 3000);
            this.isLoading = false;

            if (isShowUML) {
              this.isShowUML = true;
              this.isShowUMLSidebar = true;
            }
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
    this.datasetService.getDataset(datasetName).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;
          const dataset = this.supportService.parseItemToDataset(data);
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
}
