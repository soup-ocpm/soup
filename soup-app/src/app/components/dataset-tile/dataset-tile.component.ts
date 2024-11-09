import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { Dataset } from '../../models/dataset.model';
import { StandardGraphService } from '../../services/standard_graph.service';
import { MaterialModule } from '../../shared/modules/materlal.module';

@Component({
  selector: 'app-dataset-tile',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './dataset-tile.component.html',
  styleUrl: './dataset-tile.component.scss'
})
export class DatasetTileComponent {
  // The dataset name
  @Input() dataset: Dataset | undefined;

  // The container id
  @Input() containerId: string | undefined;

  // Handle the click to dataset tile
  @Output() selectedDataset = new EventEmitter<Dataset>();

  // Output event for dataset details navigation
  @Output() manageDataset = new EventEmitter<Dataset>();

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
      this.selectedDataset.emit(this.dataset);
    }
  }

  /**
   * Manage the Dataset
   */
  public onManageDataset(): void {
    this.manageDataset.emit(this.dataset);
  }
}
