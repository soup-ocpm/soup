import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { SButtonTComponent } from '../../core/components/s-buttons/s-button-t/s-button-t.component';
import { ToastLevel } from '../../core/enums/toast_type.enum';
import { LoggerService } from '../../core/services/logger.service';
import { NotificationService } from '../../core/services/toast.service';
import { Container } from '../../models/docker_container.model';
import { DockerService } from '../../services/docker_container.service';
import { MaterialModule } from '../../shared/modules/materlal.module';

@Component({
  selector: 'app-docker-tile',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    // Component import
    SButtonTComponent
  ],
  templateUrl: './docker-tile.component.html',
  styleUrl: './docker-tile.component.scss'
})
export class DockerTileComponent {
  // The Input Card model
  @Input() container: Container | undefined;

  // Handle the container click
  @Output() containerClick = new EventEmitter<any>();

  // Is hovered status
  public isHovered = false;

  // Loading status
  public isLoadingButton = false;

  /**
   * Constructor for DockerTileComponent component
   * @param dockerService the DockerService service
   * @param loggerService the LoggerService service
   * @param messageService the NotificationService service
   */
  constructor(
    private dockerService: DockerService,
    private loggerService: LoggerService,
    private messageService: NotificationService
  ) {}

  // Mouse enter
  public onMouseEnter() {
    this.isHovered = true;
  }

  // Mose leave
  public onMouseLeave() {
    this.isHovered = false;
  }

  // Choice the container
  public choiceContainer() {
    this.containerClick.emit(this.container);
  }

  // Handle the start container
  public startContainer(): void {
    this.isLoadingButton = true;

    this.dockerService.startContainer(this.container!.id).subscribe({
      next: (response) => {
        if (response.statusCode === 200 && response.message == 'Container started successfully') {
          this.container!.status = true;
        }
      },
      error: (error) => {
        const errorData: any = error;
        this.loggerService.error(errorData);
        this.isLoadingButton = false;
        this.messageService.show('Unable to start the Docker Container. Retry', ToastLevel.Error, 3000);
      },
      complete: () => {
        this.isLoadingButton = false;
      }
    });
  }

  // Handle the stop container
  public stopContainer(): void {
    this.isLoadingButton = true;

    this.dockerService.stopContainer(this.container!.id).subscribe({
      next: (response) => {
        if (response.statusCode === 200 && response.message == 'Container stopped successfully') {
          this.container!.status = false;
        }
      },
      error: (error) => {
        const errorData: any = error;
        this.loggerService.error(errorData);
        this.messageService.show('Unable to stop the Docker Container. Retry', ToastLevel.Error, 3000);
      },
      complete: () => {
        this.isLoadingButton = false;
      }
    });
  }
}
