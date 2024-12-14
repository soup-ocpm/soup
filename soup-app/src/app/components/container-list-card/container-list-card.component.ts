import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SDividerComponent } from '../../core/components/s-divider/s-divider.component';
import { Container } from '../../models/docker_container.model';
import { DockerTileComponent } from '../docker-tile/docker-tile.component';

@Component({
  selector: 'app-container-list-card',
  standalone: true,
  imports: [CommonModule, FormsModule, SDividerComponent, DockerTileComponent],
  templateUrl: './container-list-card.component.html',
  styleUrl: './container-list-card.component.scss'
})
export class ContainerListCardComponent {
  // Input the retrieved datasets
  @Input() dockerContainers: Container[] = [];

  // Output the selected container
  @Output() exportContainer = new EventEmitter<Container>();

  // The search
  public searchTerm = '';

  /**
   * Constructor for ContainerListCardComponent component
   */
  constructor() {}

  /**
   * Filter the docker containers
   */
  public filteredContainers(): Container[] {
    if (!this.searchTerm) {
      return this.dockerContainers;
    }

    return this.dockerContainers.filter((container) => container.name.toLowerCase().includes(this.searchTerm.toLowerCase()));
  }

  /**
   * Export the selected container
   * @param container the Docker Container
   */
  public exportSelectedContainer(container: Container): void {
    this.exportContainer.emit(container);
  }
}
