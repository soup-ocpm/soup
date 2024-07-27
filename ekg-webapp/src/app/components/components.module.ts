import { NgModule } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Components import
import { CardComponent } from './card/card.component';
import { DeleteDialogComponent } from './delete-dialog/delete-dialog.component';
import { HelpStandardDialogComponent } from './help-standard-dialog/help-standard-dialog.component';
import { HelpClassDialogComponent } from './help-class-dialog/help-class-dialog.component';
import { RetrieveCardComponent } from './retrieve-card/retrieve-card.component';
import { DockerTileComponent } from './docker-tile/docker-tile.component';

// Application module import
import { MaterialModule } from '../material.module';
import { HelpCreationDialogComponent } from './help-creation-dialog/help-creation-dialog.component';
import { SpinnerComponent } from './spinner/spinner.component';
import { FlipCardComponent } from './flip-card/flip-card.component';

@NgModule({
  declarations: [
    CardComponent,
    DeleteDialogComponent,
    HelpStandardDialogComponent,
    HelpClassDialogComponent,
    RetrieveCardComponent,
    DockerTileComponent,
    HelpCreationDialogComponent,
    SpinnerComponent,
    FlipCardComponent,
  ],
  imports: [CommonModule, FormsModule, NgOptimizedImage, MaterialModule],
  exports: [
    CardComponent,
    DeleteDialogComponent,
    HelpStandardDialogComponent,
    HelpClassDialogComponent,
    RetrieveCardComponent,
    DockerTileComponent,
    HelpCreationDialogComponent,
    SpinnerComponent,
    FlipCardComponent
  ],
})
export class ComponentsModule {}
