import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

// Models import
import { Container } from '../../core/models/container.model';
import { DockerService } from '../../services/docker.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-docker-tile',
  templateUrl: './docker-tile.component.html',
  styleUrl: './docker-tile.component.scss',
})
export class DockerTileComponent implements OnInit {
  // The Input Card model
  @Input() container: Container | undefined;

  @Output() containerClicked = new EventEmitter<any>();

  // Is hovered status
  public isHovered: boolean = false;

  // Loading status
  public isLoadingButton: boolean = false;

  /**
   * Constructor for DockerTileComponent component
   * @param dockerService the DockerService service
   * @param messageService the NotificationService service
   */
  constructor(
    private dockerService: DockerService,
    private messageService: NotificationService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {}

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

  public startContainer(): void {
    this.isLoadingButton = true;
    let response: any;

    this.dockerService.startContainer(this.container!.id).subscribe({
      next: (responseData) => {
        response = responseData;
        if (response.http_status_code === 200 && response.message == "Container started successfully"){
          this.container!.status = true;
        }
      },
      error: (errorData) => {
        response = errorData;
        this.messageService.show('Unable to start the Docker Container. Retry', false, 3000);
      },
      complete: () => {
        this.isLoadingButton = false;
      },
    });
  }

  public stopContainer(): void {
    this.isLoadingButton = true;
    let response: any;

    this.dockerService.stopContainer(this.container!.id).subscribe({
      next: (responseData) => {
        response = responseData;
        if (response.http_status_code === 200 && response.message == "Container stopped successfully"){
          this.container!.status = false;
        }
      },
      error: (errorData) => {
        response = errorData;
        this.messageService.show('Unable to stop the Docker Container. Retry', false, 3000);
      },
      complete: () => {
        this.isLoadingButton = false;
      },
    });
  }
}
