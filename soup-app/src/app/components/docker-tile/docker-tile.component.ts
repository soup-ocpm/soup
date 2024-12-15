import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { SpBtnTxtComponent } from '@aledevsharp/sp-lib';
import { NotificationService } from 'src/app/shared/components/s-toast/toast.service';
import { LoggerService } from '../../core/services/logger.service';
import { Container } from '../../models/docker_container.model';
import { DockerService } from '../../services/docker_container.service';
import { ToastLevel } from '../../shared/components/s-toast/toast_type.enum';
import { MaterialModule } from '../../shared/modules/materlal.module';

@Component({
  selector: 'app-docker-tile',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    // Component import
    SpBtnTxtComponent
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
  public isLoading = false;

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

  /**
   * On mouse enter
   */
  public onMouseEnter(): void {
    this.isHovered = true;
  }

  /**
   * On mouse leave
   */
  public onMouseLeave(): void {
    this.isHovered = false;
  }

  /**
   * Select the container
   */
  public choiceContainer(): void {
    this.containerClick.emit(this.container);
  }

  /**
   * Start container
   */
  public startContainer(): void {
    this.isLoading = true;

    this.dockerService.startContainer(this.container!.id).subscribe({
      next: (response) => {
        if (response.statusCode === 200 && response.message == 'Container started successfully') {
          this.container!.status = true;
        }
      },
      error: (error) => {
        const errorData: any = error;
        this.loggerService.error(errorData);
        this.isLoading = false;
        this.messageService.show('Unable to start the Docker Container. Retry', ToastLevel.Error, 3000);
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  /**
   * Stop the container
   */
  public stopContainer(): void {
    this.isLoading = true;

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
        this.isLoading = false;
      }
    });
  }
}
