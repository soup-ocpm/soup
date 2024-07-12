import {Component, EventEmitter, Input, Output} from '@angular/core';

// Models import
import {Container} from "../../core/models/container.model";

@Component({
  selector: 'app-docker-tile',
  templateUrl: './docker-tile.component.html',
  styleUrl: './docker-tile.component.scss'
})
export class DockerTileComponent {
  // The Input Card model
  @Input() container: Container | undefined;

  @Output() containerClicked = new EventEmitter<any>();

  // Is hovered status
  public isHovered: boolean = false;

  // Mouse enter
  public onMouseEnter() {
    this.isHovered = true;
  }

  // Mose leave
  public onMouseLeave() {
    this.isHovered = false;
  }

  /**
   * Click emitter
   */
  public handleContainer() {
    this.containerClicked.emit(this.container);
  }
}
