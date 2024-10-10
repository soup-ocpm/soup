import { Component, OnInit } from '@angular/core';
import { Data, Router } from "@angular/router";

// Service import
import { StandardGraphService } from "../../services/standard_graph.service";
import { SupportDataService } from "../../services/support_data.service";
import { NotificationService } from "../../services/notification.service";
import { FormControl, FormGroup } from '@angular/forms';
import { MatSelectionListChange } from '@angular/material/list';
import { MatDialogRef } from '@angular/material/dialog';

interface Dataset {
  value: string;
  name: string;
}

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

  // List of all dataset name
  public allDataset: string[] = [];

  // If the user have download his dataset
  public showDataset: boolean = false;

  // The form group
  public form: FormGroup | undefined;

  // The dataset control
  public datasetControl = new FormControl();

  // All dataset
  public datasets: Dataset[] = [];

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
    private dialogReg: MatDialogRef<RetrieveCardComponent>
  ) {
  }

  // NgOnInit implementation
  ngOnInit(): void {
    this.form = new FormGroup({
      clothes: this.datasetControl,
    });
  }

  // Retrieve local graph information
  public retrieveLocalInformation(): void {
    this.isLoadingProgressBar = true;
    try {
      let apiResponse: any = null;

      this.standardGraphService.getAllDataset().subscribe({
        next: responseData => {
          apiResponse = responseData;
          if (apiResponse['http_status_code'] == 200 && apiResponse['response_data'] != null) {
            this.allDataset = apiResponse['response_data'];

            if (this.allDataset.length > 0) {
              this.showDataset = true;

              // Trasformare l'array allDataset in datasets
              this.datasets = this.allDataset.map((datasetObj: any) => ({
                value: datasetObj['Name'],
                name: this.capitalizeFirstLetter(datasetObj['Name'])
              }));
            }
          } else {
            this.messageService.show('No content inside Memgraph database', false, 2000);
          }
        }, error: errorData => {
          apiResponse = errorData;
          this.messageService.show('No content inside Memgraph database', false, 2000);
        }, complete: () => { }
      })
    } catch (error) {
      this.isLoadingProgressBar = false;
      this.messageService.show('Internal Server Error. Retry', false, 2000);
    }
  }

  // Retrieve cloud graph information
  public retrieveCloudInformationHandle(): void {
    this.messageService.show('Not implemented yet...', false, 2000);
  }

  // Handle the dataset selection
  public onSelectionChange(event: MatSelectionListChange): void {
    const dataset = event.source._value?.at(0);

    if (dataset != null && dataset.length > 0) {
      this.isLoadingProgressBar = true;
      try {
        let apiResponse: any = null;

        this.standardGraphService.getGraphDetilsInfo(dataset).subscribe({
          next: response => {
            apiResponse = response;
            if (apiResponse.http_status_code === 200 && apiResponse.response_data != null) {
              this.standardGraphService.saveResponse(apiResponse.response_data);
              this.standardGraphService.saveDatasetName(dataset);
              this.supportGraphService.setHaveRetrievedInformation(true);

              this.isLoadingProgressBar = false;
              this.allowToCloseDialog = true;
              this.router.navigate(['/details']);

              this.dialogReg.close();

            } else if (apiResponse.http_status_code === 202) {
              this.isLoadingProgressBar = false;
              this.allowToCloseDialog = true;

              this.messageService.show('No content inside the Memgraph Database', false, 2000);
            }
          }, error: errorData => {
            apiResponse = errorData;
            this.isLoadingProgressBar = false;

            this.messageService.show('Error while retrieve Graph. Retry', false, 2000);
          }, complete: () => { }
        });
      } catch (error) {
        this.isLoadingProgressBar = false;
        this.messageService.show('Internal Server Error. Retry', false, 2000);
      }
    }
  }

  // Helper method to capitalize the first letter of a string
  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
