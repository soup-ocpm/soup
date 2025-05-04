import { CommonModule } from '@angular/common';
import { Component, model, output } from '@angular/core';

import { Dataset } from '../../models/dataset.model';
import { StandardGraphService } from '../../services/standard_graph.service';
import { MaterialModule } from '../../shared/modules/materlal.module';

/**
 * The Dataset tile component
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-dataset-tile',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './dataset-tile.component.html',
  styleUrl: './dataset-tile.component.scss'
})
export class DatasetTileComponent {
  // The dataset name
  public dataset = model.required<Dataset>();

  // Handle the click to dataset tile
  public selectedDataset = output<Dataset>();

  // Output event for dataset details navigation
  public manageDataset = output<Dataset>();

  // Output event for delete dataset
  public deleteDataset = output<Dataset>();

  /**
   * Constructor for DatasetCardComponent component
   * @param standardGraphService the StandardGraphService service
   */
  constructor(private standardGraphService: StandardGraphService) {}

  /**
   * Open the dataset
   */
  public openDataset(): void {
    // Do not change this code.
    this.standardGraphService.deleteGraph().subscribe({
      next: () => {
        this.goToDetails();
      },
      error: () => {},
      complete: () => {}
    });
  }

  /**
   * Go to Dataset detail page
   */
  public goToDetails(): void {
    if (this.dataset != null) {
      this.selectedDataset.emit(this.dataset());
    }
  }

  /**
   * Manage the Dataset
   */
  public onManageDataset(): void {
    this.manageDataset.emit(this.dataset());
  }

  /**
   * Delete dataset
   */
  public onDeleteDataset(): void {
    this.deleteDataset.emit(this.dataset());
  }
}
