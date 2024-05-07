import {Component, Inject, OnInit} from '@angular/core';
import {Router} from "@angular/router";

// Material import
import {MAT_DIALOG_DATA} from "@angular/material/dialog";
import {StandardGraphService} from "../../services/standard_graph.service";
import {ClassGraphService} from "../../services/class_graph.service";
import {SupportDataService} from "../../services/support_data.service";
import {NotificationService} from "../../services/notification.service";

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
   * @param messageService the NotificationService service
   * @param standardGraphService the StandardGraphService service
   * @param classGraphService the ClassGraphService service
   * @param data the data for this Dialog component
   * @param supportService the SupportDataService service
   */
  constructor(
    private router: Router,
    private messageService: NotificationService,
    private standardGraphService: StandardGraphService,
    private classGraphService: ClassGraphService,
    private supportService: SupportDataService,
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
            this.messageService.show('Class Graph deleted successfully', true, 2000);
            this.supportService.updateShowGraph(false);
            this.router.navigate(['/details']);
          }
        }, error => {
          apiResponse = error;
          if (apiResponse != null) {
            if (apiResponse.http_status_code == 404) {
              this.messageService.show('Error removing the Graph. Retry ', false, 2000);
            } else if (apiResponse.http_status_code == 500) {
              this.messageService.show('Internal Server Error. Retry', false, 2000);
            }
          }
        });
    } else {
      this.standardGraphService.deleteGraph().subscribe(
        response => {
          apiResponse = response;
          if (apiResponse != null && apiResponse.http_status_code == 200) {
            this.messageService.show('Standard Graph deleted successfully', true, 2000);
            this.resetInformation();
            this.router.navigate(['/welcome']);
          }
        }, error => {
          apiResponse = error;
          if (apiResponse != null) {
            if (apiResponse.http_status_code == 404) {
              this.messageService.show('Error removing the Graph. Retry ', false, 2000);
            } else if (apiResponse.http_status_code == 500) {
              this.messageService.show('Internal Server Error. Retry', false, 2000);
            }
          }
        });
    }
  }

  // Reset the services information
  public resetInformation(): void {
    this.supportService.setFilteredColumn([]);
    this.supportService.setHaveRetrievedInformation(false);
    this.supportService.updateShowGraph(false);

    this.standardGraphService.deleteResponse();

    this.classGraphService.deleteResponse();
  }
}
