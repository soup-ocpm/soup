import {Component, OnInit} from '@angular/core';
import {Router} from "@angular/router";

// Service import
import {StandardGraphService} from "../../services/standard_graph.service";
import {SupportDataService} from "../../services/support_data.service";
import {NotificationService} from "../../services/notification.service";

@Component({
  selector: 'app-retrieve-card',
  templateUrl: './retrieve-card.component.html',
  styleUrl: './retrieve-card.component.scss'
})
export class RetrieveCardComponent implements OnInit {

  // If it is show the Form for Cloud
  public isShowingForm: boolean = false;

  // If it is loading the progress bar
  public isLoadingProgressBar: boolean = false;

  // Allow to close dialog when the information is retrieved
  public allowToCloseDialog: boolean = false;

  /**
   * Constructor for RetrieveCardComponent component
   * @param router the Router
   * @param messageService the NotificationService service
   * @param standardGraphService the StandardGraphService service
   * @param supportGraphService the SupportDataService service
   */
  constructor(
    private router: Router,
    private messageService: NotificationService,
    private standardGraphService: StandardGraphService,
    private supportGraphService: SupportDataService,
  ) {
  }

  // NgOnInit implementation
  ngOnInit(): void {
  }

  // Retrieve local graph information
  public retrieveLocalInformation(): void {
    this.isLoadingProgressBar = true;
    try {
      let apiResponse: any = null;

      this.standardGraphService.getGraphDetails().subscribe(
        response => {
          apiResponse = response;
          if (apiResponse.http_status_code === 200 && apiResponse.response_data != null) {
            this.standardGraphService.saveResponse(apiResponse.response_data);
            this.supportGraphService.setHaveRetrievedInformation(true);
            this.isLoadingProgressBar = false;
            this.allowToCloseDialog = true;
            this.router.navigate(['/details']);
          } else if (apiResponse.http_status_code === 202) {
            this.messageService.show('No content inside the Memgraph Database', false, 2000);
            this.isLoadingProgressBar = false;
            this.allowToCloseDialog = true;
          }
        },
        error => {
          apiResponse = error;
          this.messageService.show('Error while retrieve Graph. Retry', false, 2000);
          this.isLoadingProgressBar = false;
        });
    } catch (error) {
      this.isLoadingProgressBar = false;
      this.messageService.show('Internal Server Error. Retry', false, 2000);
    }
  }

  // Retrieve cloud graph information
  public retrieveCloudInformationHandle(): void {
    this.messageService.show('Not implemented yet...', false, 2000);
  }
}
