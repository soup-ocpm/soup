import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { ContainerListCardComponent } from '../../components/container-list-card/container-list-card.component';
import { DatasetTileComponent } from '../../components/dataset-tile/dataset-tile.component';
import { SButtonComponent } from '../../core/components/s-buttons/s-button/s-button.component';
import { SDividerComponent } from '../../core/components/s-divider/s-divider.component';
import { SProgressbarComponent } from '../../core/components/s-progressbar/s-progressbar.component';
import { SSpinnerOneComponent } from '../../core/components/s-spinners/s-spinner-one/s-spinner-one.component';
import { ToastLevel } from '../../core/enums/toast_type.enum';
import { ApiResponse } from '../../core/models/api_response.model';
import { LoggerService } from '../../core/services/logger.service';
import { ModalService } from '../../core/services/modal.service';
import { NotificationService } from '../../core/services/toast.service';
import { Dataset } from '../../models/dataset.model';
import { Container } from '../../models/docker_container.model';
import { DatasetService } from '../../services/datasets.service';
import { DockerService } from '../../services/docker_container.service';
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
    SProgressbarComponent,
    ContainerListCardComponent
  ],
  templateUrl: './retrive-dataset.component.html',
  styleUrl: './retrive-dataset.component.scss'
})
export class RetriveDatasetComponent implements OnInit {
  // All the docker containers
  public dockerContainers: Container[] = [];

  // The current selected container
  public currentContainer: Container | undefined;

  // All the user datasets
  public allDataset: Dataset[] = [];

  // The search
  public searchTerm = '';

  // The current selected dataset
  public currentDataset: Dataset | undefined;

  // The model change
  public modelChange = false;

  // The bak for the current dataset
  public currentDatasetBak = '';

  // If the user have dataset
  public haveDatasets = false;

  // If the container is show or not
  public isShowContainers = false;

  // If the sidebar is open or not
  public isOpenSidebar = false;

  // If the datasets is loading
  public isLoadingDatasets = false;

  // If the container is loading
  public isLoadingContainer = false;

  // If the dataset in update is loading
  public isLoadingUpdate = false;

  // If the dataset is in creation mode
  public isCreatingDataset = false;

  /**
   * Initialize the RetriveDatasetComponent component
   * @param router the Router
   * @param toast the NotificationService service
   * @param modalService the ModalService service
   * @param dockerService the DockerService service
   * @param datasetService the DatasetService service
   * @param localDataService the LocalDataService
   */
  constructor(
    private router: Router,
    private toast: NotificationService,
    private modalService: ModalService,
    private dockerService: DockerService,
    private datasetService: DatasetService,
    private genericGraphService: GenericGraphService,
    private supportService: LocalDataService,
    private loggerService: LoggerService,
    private localDataService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.isLoadingContainer = true;

    setTimeout(() => {
      this.getDockerContainers();
    }, 1600);
  }

  /**
   * Retrieve the Docker containers
   */
  public getDockerContainers(): void {
    if (this.dockerContainers.length == 0) {
      this.dockerService.containers().subscribe({
        next: (response) => {
          if (response.statusCode == 200 && response.responseData != null) {
            const allContainers = response.responseData['all_containers'];

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

            this.isLoadingContainer = false;
            this.isShowContainers = true;
          } else {
            this.isShowContainers = false;
            this.isLoadingContainer = false;
            this.toast.show('Unable to load Docker containers. Please start Docker Engine', ToastLevel.Error, 3000);
          }
        },
        error: (error: ApiResponse<any>) => {
          if (error.statusCode == 400) {
            this.toast.show('Please start Docker Engine', ToastLevel.Error, 3000);
          } else if (error.statusCode == 500) {
            this.toast.show('Unable to load Docker containers. Please start Docker Engine', ToastLevel.Error, 3000);
          }
          this.isShowContainers = false;
          this.isLoadingContainer = false;
        },
        complete: () => {}
      });
    } else {
      this.isShowContainers = true;
    }
  }

  /**
   * Handle the select container
   * @param container the Docker container
   */
  public handleSelectedContainer(container: Container): void {
    if (container != null) {
      this.currentContainer = container;
      this.getAllDatasets();
    }
  }

  /**
   * Retrieve all datasets
   */
  public getAllDatasets(): void {
    if (this.allDataset == null || this.allDataset.length == 0) {
      this.isLoadingDatasets = true;

      this.datasetService.getAllDataset(this.currentContainer!.id).subscribe({
        next: (responseData) => {
          if (responseData.statusCode == 200 && responseData.responseData != null) {
            const data = responseData.responseData;
            data.forEach((item: any) => {
              const dataset = this.localDataService.parseItemToDataset(this.currentContainer!.id, item);

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
          if (apiResponse['statusText'] == 'Unknown Error') {
            this.toast.show(`Unable to load Datasets. Please start the Engine`, ToastLevel.Error, 5000);
          } else if (apiResponse['status'] == 500) {
            this.toast.show(`Internal Server Error. Retry`, ToastLevel.Error, 5000);
          }

          this.isLoadingDatasets = false;
          this.haveDatasets = false;
        },
        complete: () => {}
      });
    }
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

      this.genericGraphService.createDatasetGraphs(this.currentContainer!.id!, dataset.name).subscribe({
        next: (response) => {
          if (response.statusCode == 200 && response.responseData != null) {
            this.getUpdateDataset(dataset);
          } else {
            this.isCreatingDataset = false;
            this.toast.show('Error while retrieving the Dataset', ToastLevel.Success, 3000);
          }
        },
        error: (errorData) => {
          const apiResponse: any = errorData;
          this.loggerService.error(apiResponse);
          this.isCreatingDataset = false;
          this.toast.show('Error while retrieving the Dataset', ToastLevel.Success, 3000);
        },
        complete: () => {}
      });
    }
  }

  /**
   * Retrieve the update dataset
   */
  public getUpdateDataset(dataset: Dataset): void {
    this.datasetService.getDataset(this.currentContainer!.id, dataset.name).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const parsetDataset = this.supportService.parseItemToDataset(this.currentContainer!.id, response.responseData);
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
    this.currentDatasetBak = JSON.stringify(this.currentDataset);
    this.modelChange = false;
    this.isOpenSidebar = true;
  }

  /**
   * Check the model change
   * @returns true if the Dataset is changed, false
   * otherwise
   */
  public checkForModelChange(): boolean {
    return (this.modelChange = JSON.stringify(this.currentDataset) !== this.currentDatasetBak);
  }

  /**
   * Update the Dataset
   */
  public onSaveUpdate(): void {
    if (this.currentDataset != null && this.checkForModelChange()) {
      this.isLoadingUpdate = true;

      setTimeout(() => {
        this.datasetService
          .updateDatasetDescription(this.currentContainer!.id, this.currentDataset!.name, this.currentDataset!.description)
          .subscribe({
            next: (response) => {
              console.log(response);
              if (response.statusCode == 200 && response.responseData != null) {
                this.toast.show('Dataset update successfully', ToastLevel.Success, 2000);
                this.getAllDatasets();
                this.toggleSidebar();
              } else {
                this.toast.show('Unable to update Dataset. Please retry', ToastLevel.Error, 3000);
                this.toggleSidebar();
              }

              this.isLoadingUpdate = false;
            },
            error: () => {
              this.isLoadingUpdate = false;
              this.toast.show('Unable to update Dataset. Please retry', ToastLevel.Error, 3000);
            },
            complete: () => {}
          });
      }, 2000);
    }
  }

  /**
   * Restore the model
   */
  public restoreModel(): void {
    this.currentDataset = JSON.parse(this.currentDatasetBak);
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
    if (this.isOpenSidebar && this.currentDataset != null) {
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
      this.datasetService.deleteDataset(this.currentContainer!.id, this.currentDataset.name).subscribe({
        next: (response) => {
          if (response.statusCode === 200) {
            // Remove the dataset
            this.allDataset = this.allDataset.filter((item) => item.name !== this.currentDataset!.name);
            this.haveDatasets = this.allDataset.length > 0;

            // Chiudi la sidebar
            this.toggleSidebar();
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
  public toggleSidebar(): void {
    this.isOpenSidebar = false;
    this.currentDataset = undefined;
  }

  // Go to Help SOuP page
  public handleGoHelp() {
    window.open(environment.prosLabUrl, '_blank');
  }
}
