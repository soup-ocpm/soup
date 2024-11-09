import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { DetailTileComponent } from '../../components/detail-tile/detail-tile.component';
import { SButtonComponent } from '../../core/components/s-buttons/s-button/s-button.component';
import { SDividerComponent } from '../../core/components/s-divider/s-divider.component';
import { SProgressbarComponent } from '../../core/components/s-progressbar/s-progressbar.component';
import { ToastLevel } from '../../core/enums/toast_type.enum';
import { LoggerService } from '../../core/services/logger.service';
import { ModalService } from '../../core/services/modal.service';
import { NotificationService } from '../../core/services/toast.service';
import { GraphDataEnum } from '../../enums/graph_data.enum';
import { Dataset } from '../../models/dataset.model';
import { DetailGraphData } from '../../models/detail_graph_data.model';
import { ClassGraphService } from '../../services/class_graph.service';
import { DatasetService } from '../../services/datasets.service';
import { StandardGraphService } from '../../services/standard_graph.service';
import { MaterialModule } from '../../shared/modules/materlal.module';
import { LocalDataService } from '../../shared/services/support.service';

// The entity object for the list
class EntityObject {
  // Name
  name = '';

  // Number of NaN nodes
  numberOfNanNodes = 0;

  // Is selected or not
  isSelected = false;
}

@Component({
  selector: 'app-details-dataset',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    // Component import
    SButtonComponent,
    DetailTileComponent,
    SProgressbarComponent,
    SDividerComponent
  ],
  templateUrl: './details-dataset.component.html',
  styleUrl: './details-dataset.component.scss'
})
export class DetailsDatasetComponent implements OnInit {
  // The dataset name
  public currentDataset: Dataset | undefined;

  // The detail graph
  public detailGraphDataList: DetailGraphData[] = [];

  // The entity list
  public entityList: EntityObject[] = [];

  // List of selected entities
  public selectedEntities: string[] = [];

  // The progress data
  public progressData: any;

  // If the sidebar is open or not
  public isOpenSidebar = true;

  // If the sidebar is open or not
  public isOpenSecondSidebar = false;

  // If the dataset have the class graph
  public haveClassGraph = false;

  // If the progress bar is show or not
  public isLoading = false;

  /**
   * Constructor for DetailsDatasetComponent components
   * @param router the Router
   * @param activatedRoute the ActivatedRoute
   * @param toast the NotificationService service
   * @param modalService the ModalService service
   * @param supportService the SupportService service
   * @param datasetService the DatasetService service
   * @param standardGraphService the StandardGraphService service
   */
  constructor(
    private router: Router,
    private toast: NotificationService,
    private modalService: ModalService,
    private activatedRoute: ActivatedRoute,
    private supportService: LocalDataService,
    private datasetService: DatasetService,
    private logService: LoggerService,
    private classGraphService: ClassGraphService,
    private standardGraphService: StandardGraphService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    const datasetName = this.activatedRoute.snapshot.paramMap.get('name');
    this.currentDataset = this.supportService.getCurrentDataset();

    if (this.currentDataset != null && this.currentDataset.name == datasetName) {
      this.loadDatasetDetails();
      this.retrieveEntityKey();
      this.haveClassGraph = this.currentDataset.classNodes > 0;
    } else {
      this.toast.show('Unable to retrieve Dataset. Retry', ToastLevel.Error, 3000);
      this.router.navigate(['/welcome']);
      return;
    }
  }

  /**
   * Retrieve entities from the Dataset
   */
  private retrieveEntityKey(): void {
    this.standardGraphService.getEntityKey().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;
          data.forEach((item: any) => {
            const entity = new EntityObject();
            entity.name = item;
            entity.numberOfNanNodes = 0;

            this.entityList.push(entity);
          });

          this.retrieveNaNEntity();
        } else {
          this.toast.show('Unable to load the entities key of the Dataset', ToastLevel.Error, 3000);
        }
      },
      error: (errorData) => {
        const apiResponse: any = errorData;
        this.logService.error(apiResponse);
        this.toast.show('Unable to load the entities key of the Dataset', ToastLevel.Error, 3000);
      },
      complete: () => {}
    });
  }

  /**
   * Retrieve NaN entity from the Dataset
   */
  private retrieveNaNEntity(): void {
    const nullEntities: string[] = [];

    this.standardGraphService.getNullEntities().subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const data = response.responseData;

          data.forEach((item: any) => {
            nullEntities.push(item);
          });

          this.entityList.forEach((entity: EntityObject) => {
            nullEntities.forEach((item: any) => {
              if (item.property_name == entity.name) {
                entity.numberOfNanNodes = item.count_nodes;
              }
            });
          });
        } else {
          this.toast.show('Unable to load the entities key of the Dataset', ToastLevel.Error, 3000);
        }
      },
      error: (errorData) => {
        const apiResponse: any = errorData;
        this.logService.error(apiResponse);
        this.toast.show('Unable to load the entities key of the Dataset', ToastLevel.Error, 3000);
      },
      complete: () => {}
    });
  }

  /**
   * View the complete graph
   * @param standardGraph if we want to view the standard EKG
   * or aggregate EKG
   */
  public goToGraphVisualization(standardGraph: boolean): void {
    // Todo: implementare
    if (this.isOpenSecondSidebar) {
      return;
    }

    this.supportService.viewStandardGraph = standardGraph;
    this.router.navigate(['datasets', this.currentDataset!.name, 'graph']);
  }

  /**
   * Delete and build the new aggregate EKG
   */
  public deleteBuildClassGraph(): void {
    // Todo: implement
  }

  /**
   * Build the aggregate EKG
   */
  public buildClassGraph(): void {
    this.isLoading = true;
    this.isOpenSecondSidebar = false;
    this.isOpenSidebar = false;

    const formData: FormData = new FormData();
    formData.append('container_id', this.currentDataset!.containerId);
    formData.append('dataset_name', this.currentDataset!.name);

    try {
      this.classGraphService.createClassGraph(formData, this.selectedEntities, this.currentDataset!.name).subscribe({
        next: (response) => {
          if (response.statusCode === 201) {
            this.toast.show('Class graph created successfully.', ToastLevel.Success, 3000);
            this.updateDatasetInfo();
          } else {
            this.isOpenSecondSidebar = true;
            this.isOpenSidebar = true;
            this.isLoading = false;
            this.toast.show('Error while creating Class Graph. Retry', ToastLevel.Error, 3000);
          }
        },
        error: (errorData) => {
          const apiResponse: any = errorData;
          this.logService.error(apiResponse);
          this.isOpenSecondSidebar = true;
          this.isOpenSidebar = true;
          this.isLoading = false;
          this.toast.show('Error while creating Class Graph. Retry', ToastLevel.Error, 3000);
        },
        complete: () => {}
      });
    } catch (error) {
      this.toast.show(`Internal Server Error: ${error}`, ToastLevel.Error, 3000);
    }
  }

  /**
   * Retrieve the updated dataset
   */
  public updateDatasetInfo(): void {
    const containerId = this.currentDataset!.containerId;

    this.datasetService.getDataset('', this.currentDataset!.name).subscribe({
      next: (response) => {
        if (response.statusCode == 200 && response.responseData != null) {
          const updateDataset = response.responseData;
          this.currentDataset = this.supportService.parseItemToDataset(containerId, updateDataset);
          this.isLoading = false;
          this.isOpenSidebar = true;
          this.isOpenSecondSidebar = false;
        } else {
          this.isOpenSecondSidebar = true;
          this.isOpenSidebar = true;
          this.isLoading = false;
          this.toast.show('Error while get the Dataset', ToastLevel.Error, 3000);
        }
      },
      error: (errorData) => {
        const apiResponse: any = errorData;
        this.logService.error(apiResponse);
        this.isOpenSecondSidebar = true;
        this.isOpenSidebar = true;
        this.isLoading = false;
        this.toast.show('Error while get the Dataset', ToastLevel.Error, 3000);
      },
      complete: () => {}
    });
  }

  /**
   * Open the second sidebar
   */
  public openSecondSidebar(): void {
    if (this.isOpenSecondSidebar) {
      return;
    }
    this.isOpenSecondSidebar = true;
  }

  /**
   * Export the complete EKG
   */
  public exportJson(): void {
    if (this.isOpenSecondSidebar) {
      return;
    }
  }

  /**
   * Handle the click for delete EKG
   */
  public handleDeleteGraph(): void {
    if (this.isOpenSecondSidebar) {
      return;
    }
    this.modalService.showGenericModal(
      'Delete Dataset?',
      'With this operation you will eliminate the standard graph, and the class graph if present. The Dataset will be completely removed from your Database.',
      true,
      'Delete',
      '#FF0000',
      'Cancel',
      '#000000',
      () => this.deleteDataset(),
      () => {
        this.modalService.hideGenericModal();
      }
    );
  }

  /**
   * Delete the Dataset (and EKG)
   */
  public deleteDataset(): void {
    if (this.currentDataset != null) {
      this.datasetService.deleteDataset(this.currentDataset!.containerId, this.currentDataset!.name).subscribe({
        next: (response) => {
          if (response.statusCode == 200) {
            this.toast.show('Dataset deleted successfully', ToastLevel.Success, 3000);
            this.router.navigate(['/welcome']);
          }
        },
        error: (error) => {
          const apiResponse: any = error;
          this.logService.error(apiResponse);
          this.toast.show('Unable to delete the Dataset. Please retry', ToastLevel.Error, 3000);
        },
        complete: () => {}
      });
    }
  }

  /**
   * Return to the Manage Dataset page
   */
  public manageDatasets(): void {
    this.router.navigate(['/datasets']);
  }
  /**
   * Method that allow to get the toggle entities for
   * build the Class Graph.
   * @param entity the selected entity
   */
  public selectionEntity(entity: any): void {
    if (entity.isSelected) {
      this.selectedEntities.push(entity.name);
    } else {
      this.selectedEntities = this.selectedEntities.filter((item) => item !== entity.name);
    }
  }

  /**
   * Reset the entity choice
   */
  public resetSelection(): void {
    this.selectedEntities = [];

    this.entityList.forEach((entity) => {
      entity.isSelected = false;
    });
  }

  /**
   * Close the second sidebar
   */
  public toggleSecondSidebar(): void {
    this.isOpenSecondSidebar = false;
    this.resetSelection();
  }

  /**
   * Get the entity tooltip label
   * @param entity the entity
   * @returns the label
   */
  public getEntityWarningLabel(entity: any) {
    return `${entity.numberOfNanNodes} nodes have NaN value.`;
  }

  // Load the dataset details
  private loadDatasetDetails(): void {
    const entityTile = new DetailGraphData();
    entityTile.title = 'Event nodes';
    entityTile.dataNumber = this.currentDataset!.eventNodes;
    entityTile.dataType = GraphDataEnum.EventNodes;
    entityTile.description = `Generated ${entityTile.dataNumber} event nodes`;
    entityTile.type = 'event nodes';

    const eventTile = new DetailGraphData();
    eventTile.title = 'Entity nodes';
    eventTile.dataNumber = this.currentDataset!.entityNodes;
    eventTile.dataType = GraphDataEnum.EntityNodes;
    eventTile.description = `Generated ${eventTile.dataNumber} entity nodes`;
    eventTile.type = 'entity nodes';

    const corrTile = new DetailGraphData();
    corrTile.title = ':CORR relationships';
    corrTile.dataNumber = this.currentDataset!.corrRel;
    corrTile.dataType = GraphDataEnum.CorrLinks;
    corrTile.description = `Generated ${corrTile.dataNumber} :CORR relationships`;
    corrTile.type = ':CORR relationships';

    const dfTile = new DetailGraphData();
    dfTile.title = ':DF relationships';
    dfTile.dataNumber = this.currentDataset!.dfRel;
    dfTile.dataType = GraphDataEnum.DfcLinks;
    dfTile.description = `Generated ${dfTile.dataNumber} :DF relationships`;
    dfTile.type = ':DF relationships';

    this.detailGraphDataList.push(entityTile);
    this.detailGraphDataList.push(eventTile);
    this.detailGraphDataList.push(corrTile);
    this.detailGraphDataList.push(dfTile);
  }
}
