import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConnectorPageService } from './connector-page.service';


@Component({
  selector: 'app-connector-page',
  templateUrl: './connector-page.component.html',
  styleUrls: ['./connector-page.component.scss']
})

/**
 * Connector page class.
 */
export class ConnectorPageComponent implements OnInit {

  /**
  * Boolean variable that indicate if the tutoria
  * is finished.
  */
  isTerminate: boolean | undefined;

  /**
   * Boolean variable that indicate if is 
   * showing progress bar.
   */
  isLoadingProgressBar: boolean | undefined;

  // FormGroup for connection to Neo4j database.
  connectionForm !: FormGroup

  // Associate Http response.
  responseCall: any;

  constructor(
    private formBuilder: FormBuilder,
    private serviceCall: ConnectorPageService
  ) { }

  //NgOnInit implementation method.
  ngOnInit(): void {
    this.isTerminate = true;
    this.isLoadingProgressBar = false;
    this.initForms();
  }

  // Init FormGroup with Validarots.
  initForms() {
    this.connectionForm = this.formBuilder.group({
      uri: [null, [Validators.required]],
      instanceId: [null, [Validators.required]],
      instanceName: [null, [Validators.required]],
      username: [null, [Validators.required]],
      password: [null, [Validators.required]]
    })
  }

  // Method that connecto user into Database Neo4j
  connect() {
    if (this.connectionForm?.valid) {
      this.isLoadingProgressBar = true;
      const uri = this.connectionForm.value.uri;
      const instanceId = this.connectionForm.value.instanceId;
      const instanceName = this.connectionForm.value.instanceName;
      const username = this.connectionForm.value.username;
      const password = this.connectionForm.value.password;
      this.serviceCall.connectToDatabase(uri, instanceId, instanceName, username, password)
        .subscribe(
          (response) => {
            this.responseCall = response;
            //Todo fare delle operazioni

            setTimeout(() => {
              this.isLoadingProgressBar = false;
            }, 2000);
          },
          (error) => {
            this.responseCall = error;
            //Todo fare delle operazioni

            setTimeout(() => {
              this.isLoadingProgressBar = false;
            }, 2000);
          })
    }
  }

  // Clear the input of Form
  clearInput() {
    this.connectionForm.reset();
  }

}
