import {NgModule} from "@angular/core";
import {CommonModule, NgOptimizedImage} from "@angular/common";
import {FormsModule} from "@angular/forms";

// Components import
import {CardComponent} from "./card/card.component";
import {DeleteDialogComponent} from "./delete-dialog/delete-dialog.component";
import {HelpStandardDialogComponent} from "./help-standard-dialog/help-standard-dialog.component";
import {HelpClassDialogComponent} from "./help-class-dialog/help-class-dialog.component";
import {RetrieveCardComponent} from "./retrieve-card/retrieve-card.component";
import {DockerTileComponent} from './docker-tile/docker-tile.component';
import {DockerTileDirectoryComponent} from './docker-tile-directory/docker-tile-directory.component';

// Application module import
import {MaterialModule} from "../material.module";

@NgModule({
  declarations: [
    CardComponent,
    DeleteDialogComponent,
    HelpStandardDialogComponent,
    HelpClassDialogComponent,
    RetrieveCardComponent,
    DockerTileComponent,
    DockerTileDirectoryComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    NgOptimizedImage,
    MaterialModule,
  ],
  exports: [
    CardComponent,
    DeleteDialogComponent,
    HelpStandardDialogComponent,
    HelpClassDialogComponent,
    RetrieveCardComponent,
    DockerTileComponent,
    DockerTileDirectoryComponent
  ]
})
export class ComponentsModule {
}
