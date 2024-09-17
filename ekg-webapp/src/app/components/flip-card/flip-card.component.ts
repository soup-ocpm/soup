import { Component, Input, OnInit } from '@angular/core';

// Models import
import { Card } from '../../core/models/card.model';

// Other import
import { saveAs } from "file-saver";
import { DataGraphEnum } from '../../core/enums/data_enum';
import { GraphJSONService } from '../../services/graph_json.service';
import { HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-flip-card',
  templateUrl: './flip-card.component.html',
  styleUrl: './flip-card.component.scss'
})
export class FlipCardComponent implements OnInit {
  // The Input Card model
  @Input() card: Card | undefined;

  // Loading status
  public isLoading: boolean = false;

  // Response data
  public responseData: any;

  /**
   * Constructor for FlipCardComponent component
   * @param graphJSONService the GraphJSONService service
   * @param messageService the NotificationService service
   */
  constructor(
    private graphJSONService: GraphJSONService,
    private messageService: NotificationService
  ) { }

  // NgOnInit implementation
  public ngOnInit(): void { }

  /**
   * Allow the User to download JSON data
  */
  public async downloadJson() {
    this.isLoading = true;

    let request: Observable<HttpRequest<any>>;

    switch (this.card?.dataType) {
      case DataGraphEnum.EventNodes:
        request = this.graphJSONService.eventNodesJS();
        break;
      case DataGraphEnum.EntityNodes:
        request = this.graphJSONService.entityNodesJS();
        break;
      case DataGraphEnum.CORRLinks:
        request = this.graphJSONService.corrLinksJS();
        break;
      case DataGraphEnum.DFLinks:
        request = this.graphJSONService.dfLinksJS();
        break;
      case DataGraphEnum.ClassNodes:
        request = this.graphJSONService.classNodesJS();
        break;
      case DataGraphEnum.DFCLinks:
        request = this.graphJSONService.dfLinksJS();
        break;
      default:
        request = this.graphJSONService.eventNodesJS();
    }

    let callResponse: any;
    request.subscribe({
      next: responseData => {
        callResponse = responseData;
        if (callResponse['http_status_code'] == 200) {
          this.responseData = callResponse['response_data'];
          if (this.responseData != null) {
            const jsonString = JSON.stringify(this.responseData, null, 2);
            const svgBlob = new Blob([jsonString], { type: 'json' });
            saveAs(svgBlob, `${this.card?.title}.json`);
            this.responseData = null;
          }
          this.isLoading = false;
        } else {
          this.messageService.show('No content', false, 2000);
        }
      }, error: errorData => {
        callResponse = errorData;
        this.messageService.show('Error. Retry', false, 2000);
        this.isLoading = false;
      }, complete: () => {
        this.isLoading = false;
      }
    })

    this.isLoading = false;
  }
}