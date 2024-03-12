import {Component, Inject, OnInit} from '@angular/core';
import {Router} from "@angular/router";

// Material import
import {MatSnackBar} from "@angular/material/snack-bar";
import {MAT_DIALOG_DATA} from "@angular/material/dialog";
import {StandardGraphService} from "../../services/standard_graph.service";
import {ClassGraphService} from "../../services/class_graph.service";

@Component({
  selector: 'app-delete-dialog',
  templateUrl: './delete-dialog.component.html',
  styleUrl: './delete-dialog.component.scss'
})
export class DeleteDialogComponent implements OnInit {

  // If the dialog is for delete Class graph
  public isDeleteClassGraph: boolean = false;

  /**
   * Constructor for DeleteDialogComponent component
   * @param router the Router
   * @param snackBar the Material Snackbar
   * @param standardGraphService the StandardGraphService service
   * @param classGraphService the ClassGraphService service
   * @param data the data for this Dialog component
   */
  constructor(
    private router: Router,
    private snackBar: MatSnackBar,
    private standardGraphService: StandardGraphService,
    private classGraphService: ClassGraphService,
    @Inject(MAT_DIALOG_DATA) public data: { isClass: boolean }
  ) {
  }

  // NgOnInit implementation
  ngOnInit(): void {
    this.isDeleteClassGraph = this.data.isClass;
  }

  // Delete the graph
  public deleteGraph(): void {
    let apiResponse: any;
    if (this.isDeleteClassGraph) {
      this.classGraphService.deleteClassGraph().subscribe(
        response => {
          apiResponse = response;
          if (apiResponse != null && apiResponse.http_status_code == 200) {
            this.openSnackBar('Graph deleted successfully !', 'Done');
            this.router.navigate(['/welcome']);
          }
        }, error => {
          apiResponse = error;
          if (apiResponse != null) {
            if (apiResponse.http_status_code == 404) {
              this.openSnackBar('Error while delete Graph.', 'Retry');
            } else if (apiResponse.http_status_code == 500) {
              this.openSnackBar('Internal Server Error.', 'Retry');
            }
          }
        });
    } else {
      this.standardGraphService.deleteGraph().subscribe(
        response => {
          apiResponse = response;
          if (apiResponse != null && apiResponse.http_status_code == 200) {
            this.openSnackBar('Graph deleted successfully !', 'Done');
            this.router.navigate(['/welcome']);
          }
        }, error => {
          apiResponse = error;
          if (apiResponse != null) {
            if (apiResponse.http_status_code == 404) {
              this.openSnackBar('Error while delete Graph.', 'Retry');
            } else if (apiResponse.http_status_code == 500) {
              this.openSnackBar('Internal Server Error.', 'Retry');
            }
          }
        });
    }
  }

  // Handle the open Snackbar
  public openSnackBar(message: string, action: string): void {
    this.snackBar.open(message, action);
  }
}
