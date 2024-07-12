import {Component, EventEmitter, Input, Output} from '@angular/core';

@Component({
  selector: 'app-docker-tile-directory',
  templateUrl: './docker-tile-directory.component.html',
  styleUrl: './docker-tile-directory.component.scss'
})
export class DockerTileDirectoryComponent {
// The Input Card model
  @Input() directory: string | undefined;

  @Output() directoryClicked = new EventEmitter<any>();

  /**
   * Click emitter
   */
  public handleContainer() {
    this.directoryClicked.emit(this.directory);
  }
}
