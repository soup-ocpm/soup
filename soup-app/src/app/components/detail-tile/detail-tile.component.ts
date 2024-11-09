import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import { SSpinnerOneComponent } from '../../core/components/s-spinners/s-spinner-one/s-spinner-one.component';
import { DetailGraphData } from '../../models/detail_graph_data.model';

@Component({
  selector: 'app-detail-tile',
  standalone: true,
  imports: [
    CommonModule,
    // Component import
    SSpinnerOneComponent
  ],
  templateUrl: './detail-tile.component.html',
  styleUrl: './detail-tile.component.scss'
})
export class DetailTileComponent {
  // The detail graph model
  @Input() detailModel: DetailGraphData | undefined;

  // Loading status
  public isLoading = false;

  // Constructor for DetailTileComponent component
  constructor() {}

  // Get and download the json content
  public getJsonData(): void {}
}
