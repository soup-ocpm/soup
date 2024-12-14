import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { DatasetTileComponent } from '../../components/dataset-tile/dataset-tile.component';
import { SButtonComponent } from '../../core/components/s-buttons/s-button/s-button.component';
import { SDividerComponent } from '../../core/components/s-divider/s-divider.component';
import { ModalService } from '../../core/components/s-modals/modal.service';
import { SProgressbarComponent } from '../../core/components/s-progressbar/s-progressbar.component';
import { SSpinnerOneComponent } from '../../core/components/s-spinners/s-spinner-one/s-spinner-one.component';
import { NotificationService } from '../../core/components/s-toast/toast.service';
import { ToastLevel } from '../../core/enums/toast_type.enum';
import { ApiResponse } from '../../core/models/api_response.model';
import { LoggerService } from '../../core/services/logger.service';
import { Dataset } from '../../models/dataset.model';
import { DatasetService } from '../../services/datasets.service';
import { GenericGraphService } from '../../services/generic_graph.service';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

@Component({
  selector: 'app-retrive-dataset',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    // Component import
    SButtonComponent,
    DatasetTileComponent,
    SSpinnerOneComponent,
    SDividerComponent,
    SProgressbarComponent
  ],
  templateUrl: './retrive-dataset.component.html',
  styleUrl: './retrive-dataset.component.scss'
})
export class RetriveDatasetComponent implements OnInit {
  // All the user datasets
  public allDataset: Dataset[] = [];

  // The search
  public searchTerm = '';

  // The current selected dataset
  public currentDataset: Dataset | undefined;

  // The bak for the current dataset
  public datasetDescriptionBak = '';

  // The model change
  public modelChange = false;

  // If the user have dataset
  public haveDatasets = false;

  // If the container is show or not
  public isShowContainers = false;

  // If the sidebar is open or not
  public isOpenSidebar = false;

  // If the sidebar for columns is open or not
  public isOpenColumnsSidebar = false;

  // If the datasets is loading
  public isLoadingDatasets = false;

  // If the dataset in update is loading
  public isLoadingUpdate = false;

  // If the dataset is in creation mode
  public isCreatingDataset = false;

  /**
   * Constructor for RetriveDatasetComponent component
   * @param router the Router
   * @param toast the NotificationService service
   * @param modalService the ModalService service
   * @param datasetService the DatasetService service
   * @param genericGraphService the GenericGraphService service
   * @param supportService the LocalDataService service
   * @param loggerService the LoggerService service
   * @param localDataService the LocalDataService service
   */
  constructor(
    private router: Router,
    private toast: NotificationService,
    private modalService: ModalService,
    private datasetService: DatasetService,
    private genericGraphService: GenericGraphService,
    private supportService: LocalDataService,
    private loggerService: LoggerService,
    private localDataService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.isLoadingDatasets = true;

    setTimeout(() => {
      this.getAllDatasets();
    }, 1000);
  }

  /**
   * Retrieve all datasets
   */
  public getAllDatasets(): void {
    this.isLoadingDatasets = true;
    this.allDataset = [];

    try {
      this.datasetService.getAllDataset().subscribe({
        next: (responseData) => {
          if (responseData.statusCode == 200 && responseData.responseData != null) {
            const data = responseData.responseData;
            data.forEach((item: any) => {
              const dataset = this.localDataService.parseItemToDataset(item);

              if (dataset != null) {
                this.allDataset.push(dataset);
              }
            });

            if (this.allDataset.length > 0) {
              this.haveDatasets = true;
              this.isShowContainers = false;
            }

            this.isLoadingDatasets = false;
          } else {
            this.isLoadingDatasets = false;
            this.haveDatasets = false;
            this.isShowContainers = false;
          }
        },
        error: (errorData: ApiResponse<any>) => {
          const apiResponse: any = errorData;

          // Gestione errore di connessione rifiutata
          if (apiResponse['statusText'] === 'Unknown Error' || errorData.message.includes('ERR_ConnectionRefused')) {
            this.toast.show(`Unable to load Datasets. Please start the Engine`, ToastLevel.Error, 5000);
          } else if (apiResponse['status'] === 500) {
            this.toast.show(`Internal Server Error. Retry`, ToastLevel.Error, 5000);
          } else {
            this.toast.show(`Unexpected error occurred: ${errorData.message}`, ToastLevel.Error, 5000);
          }

          this.isLoadingDatasets = false;
          this.haveDatasets = false;
        },
        complete: () => {}
      });
    } catch {
      this.isLoadingDatasets = false;
      this.haveDatasets = false;
      this.toast.show(`Internal Server Error. Retry`, ToastLevel.Error, 5000);
    }
  }

  /**
   * Reload the datasets
   */
  public reloadDatasets(): void {
    this.isLoadingDatasets = true;
    setTimeout(() => {
      this.getAllDatasets();
    }, 1000);
  }

  /**
   * Check the validity of the svg file if exist
   */
  public checkIfSvgIsValid(svgContent: any): boolean {
    // Verifica che il contenuto sia una stringa
    if (typeof svgContent === 'string') {
      return svgContent.trim().startsWith('<svg');
    }
    return true;
  }

  /**
   * Filter the dataset
   * @returns the Datasets
   */
  public filteredDatasets(): Dataset[] {
    if (!this.searchTerm) {
      return this.allDataset;
    }
    return this.allDataset.filter((dataset) => dataset.name.toLowerCase().includes(this.searchTerm.toLowerCase()));
  }

  /**
   * Selected the dataset
   * @param dataset the Dataset
   */
  public onSelectedDataset(dataset: Dataset): void {
    if (dataset != null) {
      this.isCreatingDataset = true;

      this.genericGraphService.createDatasetGraphs(dataset.name).subscribe({
        next: (response) => {
          if (response.statusCode == 200 && response.responseData != null) {
            this.getUpdateDataset(dataset);
          } else {
            this.isCreatingDataset = false;
            this.toast.show('Error while retrieving the Dataset', ToastLevel.Error, 3000);
          }
        },
        error: (errorData) => {
          const apiResponse: any = errorData;
          this.loggerService.error(apiResponse);
          this.isCreatingDataset = false;
          this.toast.show('Error while retrieving the Dataset', ToastLevel.Error, 3000);
        },
        complete: () => {}
      });
    }
  }

  /**
   * Retrieve the update dataset
   */
  public getUpdateDataset(dataset: Dataset): void {
    this.datasetService.getDataset(dataset.name).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const parsetDataset = this.supportService.parseItemToDataset(response.responseData);
          this.supportService.setCurrentDataset(parsetDataset!);
          this.router.navigate(['/datasets', parsetDataset!.name]);
          this.isCreatingDataset = false;
        } else {
          this.isCreatingDataset = false;
          this.toast.show('Unable to retrieve the Dataset. Retry', ToastLevel.Error, 2000);
        }
      },
      error: (errorData) => {
        const apiResponse: any = errorData;
        this.loggerService.error(apiResponse);
        this.isCreatingDataset = false;
        this.toast.show('Unable to retrieve the Dataset. Retry', ToastLevel.Error, 2000);
      },
      complete: () => {}
    });
  }
  /**
   * Manage the dataset
   * @param event the Dataset
   */
  public onManageDataset(event: Dataset) {
    this.currentDataset = event;
    this.datasetDescriptionBak = this.currentDataset.description;
    this.modelChange = false;
    this.isOpenSidebar = true;
  }

  /**
   * Delete the Dataset
   * @param event the Dataset
   */
  public onDeleteDataset(event: Dataset) {
    this.currentDataset = event;
    this.openModalDelete();
  }

  /**
   * Check the model change
   * @returns true if the Dataset is changed, false
   * otherwise
   */
  public checkForModelChange(): boolean {
    return (this.modelChange = this.currentDataset!.description !== this.datasetDescriptionBak);
  }

  /**
   * Update the Dataset
   */
  public onSaveUpdate(): void {
    if (this.currentDataset != null && this.checkForModelChange()) {
      this.isLoadingUpdate = true;

      setTimeout(() => {
        this.datasetService.updateDatasetDescription(this.currentDataset!.name, this.currentDataset!.description).subscribe({
          next: (response) => {
            if (response.statusCode == 200 && response.responseData != null) {
              this.isOpenSidebar = false;
              this.isLoadingDatasets = true;
              const updatedDataset = this.supportService.parseItemToDataset(response.responseData);

              if (updatedDataset != null) {
                this.currentDataset!.description = updatedDataset.description;
                this.currentDataset!.dateModified = updatedDataset.dateModified;

                this.allDataset.forEach((item: Dataset) => {
                  if (item.name == updatedDataset.name && item.dateCreated == updatedDataset.dateCreated) {
                    item.description = updatedDataset.description;
                    item.dateCreated = updatedDataset.dateCreated;
                    this.isLoadingDatasets = false;
                  }
                });
              }
              this.toast.show('Dataset update successfully', ToastLevel.Success, 2000);
            } else {
              this.toast.show('Unable to update Dataset. Please retry', ToastLevel.Error, 3000);
              this.handleSidebar();
            }

            this.isLoadingUpdate = false;
          },
          error: () => {
            this.isLoadingUpdate = false;
            this.toast.show('Unable to update Dataset. Please retry', ToastLevel.Error, 3000);
          },
          complete: () => {}
        });
      }, 1000);
    }
  }

  /**
   * Restore the model
   */
  public restoreModel(): void {
    this.currentDataset!.description = this.datasetDescriptionBak;
    this.modelChange = false;
  }

  /**
   * Handle the click new dataset button
   */
  public newDataset(): void {
    this.router.navigate(['/new-dataset']);
  }

  /**
   * Open the modal for delete dataset
   */
  public openModalDelete(): void {
    if (this.currentDataset != null) {
      this.modalService.showGenericModal(
        'Delete Dataset?',
        'Are you sure you want to delete the dataset? With this non-reversible operation, all graphs within this dataset will be deleted',
        true,
        'Delete',
        '#FF0000',
        'Cancel',
        '#555',
        () => this.deleteDataset(),
        () => this.closeModal()
      );
    }
  }

  /**
   * Delete the dataset
   */
  public deleteDataset(): void {
    if (this.currentDataset != null) {
      this.datasetService.deleteDataset(this.currentDataset.name).subscribe({
        next: (response) => {
          if (response.statusCode === 200) {
            // Remove the dataset
            this.allDataset = this.allDataset.filter((item) => item.name !== this.currentDataset!.name);
            this.haveDatasets = this.allDataset.length > 0;

            // Chiudi la sidebar
            this.handleSidebar();
            this.toast.show('Dataset deleted successfully', ToastLevel.Success, 3000);
          }
        },
        error: () => {
          this.toast.show('Unable to delete the Dataset. Please retry', ToastLevel.Error, 3000);
        }
      });
    }
  }

  /**
   * Close the modal
   */
  public closeModal(): void {
    this.modalService.hideGenericModal();
  }

  /**
   * Close the sidebar
   */
  public handleSidebar(): void {
    this.isOpenSidebar = false;
    this.currentDataset = undefined;
  }

  /**
   * Close column sidebar
   */
  public handleColumnSidebar(): void {
    this.isOpenColumnsSidebar = !this.isOpenColumnsSidebar;
  }

  /**
   * Go to Help SOuP page
   */
  public handleGoHelp() {
    window.open(environment.prosLabUrl, '_blank');
  }
}
