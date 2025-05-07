import { SpBtnComponent, SpDividerComponent, SpProgressbarComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalService } from 'src/app/shared/components/s-modals/modal.service';
import { SidebarComponent } from 'src/app/shared/components/s-sidebar/s-sidebar.component';
import { SidebarService } from 'src/app/shared/components/s-sidebar/sidebar.service';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';

import { environment } from '../../../environments/environment';
import { DatasetTileComponent } from '../../components/dataset-tile/dataset-tile.component';
import { ApiResponse } from '../../core/models/api_response.model';
import { LoggerService } from '../../core/services/logger.service';
import { Dataset } from '../../models/dataset.model';
import { DatasetService } from '../../services/datasets.service';
import { GenericGraphService } from '../../services/generic_graph.service';
import { ToastLevel } from '../../shared/components/s-toast/toast_type.enum';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

/**
 * Manage Dataset component
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-manage-datasets',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    // Component import
    SpDividerComponent,
    SpProgressbarComponent,
    SpSpinnerComponent,
    DatasetTileComponent,
    SidebarComponent,
    SpBtnComponent
  ],
  templateUrl: './manage-datasets.component.html',
  styleUrl: './manage-datasets.component.scss'
})
export class ManageDatasetsComponent implements OnInit, AfterViewChecked {
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

  // List of the sidebar ids
  public sidebarIds: string[] = [];

  // If the datasets is loading
  public isLoadingDatasets = false;

  // If the dataset in update is loading
  public isLoadingUpdate = false;

  // If the dataset is in creation mode
  public isCreatingDataset = false;

  // The svg container
  @ViewChild('svgContainer', { static: false }) svgContainer: any;

  /**
   * Constructor for RetriveDatasetComponent component
   * @param router the Router
   * @param toast the NotificationService service
   * @param modalService the ModalService service
   * @param datasetService the DatasetService service
   * @param genericGraphService the GenericGraphService service
   * @param sidebarService the SidebarService service
   * @param supportService the LocalDataService service
   * @param logger the LoggerService service
   * @param localDataService the LocalDataService service
   */
  constructor(
    private router: Router,
    private toast: NotificationService,
    private modalService: ModalService,
    private datasetService: DatasetService,
    private genericGraphService: GenericGraphService,
    public sidebarService: SidebarService,
    private supportService: LocalDataService,
    private logger: LoggerService,
    private localDataService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.sidebarService.clearAllSidebars();
    this.isLoadingDatasets = true;

    setTimeout(() => {
      this.getAllDatasets();
    }, 200);
  }

  // NgAfterViewInit implementation
  public ngAfterViewChecked() {
    if (this.svgContainer) {
      this.resizeSvg();
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

            this.isLoadingDatasets = false;
          } else {
            this.isLoadingDatasets = false;
          }
        },
        error: (errorData: ApiResponse<any>) => {
          const apiResponse: any = errorData;

          // Gestione errore di connessione rifiutata
          if (apiResponse['statusText'] === 'Unknown Error' || errorData.message.includes('ERR_ConnectionRefused')) {
            this.toast.show(`Unable to load Datasets. Please start the Engine`, ToastLevel.Error, 5000);
            this.logger.error('Unable to load Datasets. Please start the Engine.');
          } else if (apiResponse['status'] === 500) {
            this.toast.show(`Internal Server Error while retrieving datasets`, ToastLevel.Error, 5000);
            this.logger.error('Internal Server Error while retrieving datasets.');
          } else {
            this.toast.show(`Unexpected error occurred: ${errorData.message}`, ToastLevel.Error, 5000);
            this.logger.error(`Unexpected error occurred: ${errorData.message}`);
          }

          this.isLoadingDatasets = false;
          this.logger.error(errorData.message);
          this.logger.error(errorData.responseData);
        }
      });
    } catch {
      this.isLoadingDatasets = false;
      this.logger.error('Internal Server Error while retrieving datasets');
      this.toast.show(`Internal Server Error. Retry`, ToastLevel.Error, 5000);
    }
  }

  /**
   * Check the validity of the svg file if exist
   * @returns true if the svg is valid, false otherwise
   */
  public checkIfSvgIsValid(svgContent: any): boolean {
    if (typeof svgContent === 'string') {
      return svgContent.trim().startsWith('<svg');
    }

    return true;
  }

  /**
   * Filter the dataset
   * @returns a list of filtered datasets
   */
  public filteredDatasets(): Dataset[] {
    if (!this.searchTerm) {
      return this.allDataset;
    }

    return this.allDataset.filter((dataset) => dataset.name.toLowerCase().includes(this.searchTerm.toLowerCase()));
  }

  /**
   * Selected the dataset
   * @param dataset the dataset
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

            this.logger.error('Error while retrieving the Dataset.', response.message);
            this.toast.show('Error while retrieving the Dataset. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.isCreatingDataset = false;

          this.logger.error('Error while retrieving the Dataset', errorData.message);
          this.toast.show('Error while retrieving the Dataset. Retry', ToastLevel.Error, 3000);
        }
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

          this.logger.error('Error while retrieving the updated Dataset', response.message);
          this.toast.show('Error while retrieving the updated Dataset. Retry', ToastLevel.Error, 2000);
        }
      },
      error: (errorData: ApiResponse<any>) => {
        this.isCreatingDataset = false;

        this.logger.error('Error while retrieving the updated Dataset', errorData.message);
        this.toast.show('Error while retrieving the updated Dataset. Retry', ToastLevel.Error, 2000);
      }
    });
  }

  /**
   * Manage the dataset
   * @param event the Dataset
   * @param content the template ref for the sidebar
   */
  public onManageDataset(event: Dataset, content: TemplateRef<any>): void {
    this.currentDataset = event;
    this.datasetDescriptionBak = this.currentDataset.description;
    this.modelChange = false;

    const sidebarId = 'manage-dataset-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '600px',
        backgroundColor: '#f9f9f9',
        title: this.currentDataset!.name + ' ' + 'Dataset',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: [{ label: 'Delete', action: () => this.openModalDeleteDataset(), color: '#ff0000' }]
      },
      content,
      sidebarId
    );

    setTimeout(() => {
      this.resizeSvg();
    }, 10);
  }

  /**
   * Resize the svg dimension
   */
  private resizeSvg(): void {
    const svgElement = this.svgContainer?.nativeElement.querySelector('svg');

    if (svgElement) {
      svgElement.setAttribute('width', '100%');
      svgElement.setAttribute('height', '300px');
    }
  }

  /**
   * Check the model change
   */
  public checkForModelChange(event: Dataset): void {
    const sidebarId = 'manage-dataset-sidebar';
    const hasChanged = this.currentDataset!.description !== this.datasetDescriptionBak;

    if (hasChanged) {
      this.modelChange = true;

      // Update the Sidebar configuration
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [
          { label: 'Save', action: () => this.onSaveUpdate(), color: 'var(--primary-color)' },
          { label: 'Restore', action: () => this.restoreModel(), color: '#6c757d' },
          { label: 'Delete', action: () => this.onDeleteDataset(event), color: '#ff0000' }
        ]
      });
    } else {
      this.modelChange = false;

      // Reset the sidebar configuration
      this.sidebarService.updateConfig(sidebarId, {
        footerButtons: [{ label: 'Delete', action: () => this.deleteDataset(), color: '#ff0000' }]
      });
    }
  }

  /**
   * Restore the model
   */
  public restoreModel(): void {
    this.currentDataset!.description = this.datasetDescriptionBak;
    this.modelChange = false;

    // Reset the sidebar configuration
    this.sidebarService.updateConfig('manage-dataset-sidebar', {
      footerButtons: [{ label: 'Delete', action: () => this.deleteDataset(), color: '#ff0000' }]
    });
  }

  /**
   * Update the Dataset
   */
  public onSaveUpdate(): void {
    if (this.currentDataset != null && this.currentDataset!.description !== this.datasetDescriptionBak) {
      this.isLoadingUpdate = true;

      setTimeout(() => {
        this.datasetService.updateDatasetDescription(this.currentDataset!.name, this.currentDataset!.description).subscribe({
          next: (response) => {
            if (response.statusCode == 200 && response.responseData != null) {
              this.sidebarService.close('manage-dataset-sidebar');
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
              this.sidebarService.close('manage-dataset-sidebar');

              this.logger.error('Error while update the Dataset', response.responseData);
              this.toast.show('Error while update the Dataset. Please retry', ToastLevel.Error, 3000);
            }

            this.isLoadingUpdate = false;
          },
          error: (errorData: ApiResponse<any>) => {
            this.isLoadingUpdate = false;

            this.logger.error('Error while update the Dataset', errorData.message);
            this.toast.show('Error while update the Dataset. Please retry', ToastLevel.Error, 3000);
          }
        });
      }, 1000);
    }
  }

  /**
   * Delete the Dataset
   * @param event the Dataset
   */
  public onDeleteDataset(event: Dataset): void {
    this.currentDataset = event;
    this.openModalDeleteDataset();
  }

  /**
   * Manage column sidebar
   * @param content the template ref for the sidebar
   */
  public onManageColumn(content: TemplateRef<any>): void {
    const sidebarId = 'manage-column-sidebar';

    if (!this.sidebarIds.includes(sidebarId)) {
      this.sidebarIds.push(sidebarId);
    }

    // Open the sidebar
    this.sidebarService.open(
      {
        width: '600px',
        backgroundColor: '#f9f9f9',
        title: 'CSV Columns',
        closeIcon: true,
        stickyFooter: true,
        footerButtons: []
      },
      content,
      sidebarId
    );
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
  public openModalDeleteDataset(): void {
    if (this.currentDataset != null) {
      const title = 'Delete' + ' ' + this.currentDataset!.name + ' ' + 'Dataset?';
      this.modalService.showDeleteDatasetModal(
        title,
        'Are you sure you want to delete this Dataset? This operation is not reversible',
        this.currentDataset!.name,
        true,
        'Delete',
        '#FF0000',
        'Cancel',
        '#555',
        (name: string) => {
          return this.preDeleteDataset(name);
        },
        () => {
          this.modalService.hideDeleteDatasetModal();
        }
      );
    }
  }

  /**
   * Catch the promise and data from modal
   * @param name the name
   * @return a void Promise
   */
  public preDeleteDataset(name: string): Promise<void> {
    if (name !== null && name != '') {
      this.deleteDataset();
    }

    return Promise.resolve();
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
            this.sidebarService.close('manage-dataset-sidebar');
            this.toast.show('Dataset deleted successfully', ToastLevel.Success, 3000);
          } else {
            this.logger.error('Error while deleting the dataset', response.message);
            this.toast.show('Error while deleting the dataset. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData: ApiResponse<any>) => {
          this.logger.error('Error while deleting the dataset', errorData.message);
          this.toast.show('Error while deleting the dataset. Please retry', ToastLevel.Error, 3000);
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
   * Go to Help SOUP page
   */
  public handleGoHelp() {
    window.open(environment.prosLabUrl, '_blank');
  }
}
