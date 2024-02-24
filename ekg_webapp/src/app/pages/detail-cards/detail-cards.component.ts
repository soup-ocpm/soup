import { AfterViewInit, Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

// Service Import
import { GraphService } from 'src/app/services/graph.service';

// Model Import
import { Card } from 'src/app/models/card.model';
import { MasterCard } from 'src/app/models/master_card.model';

@Component({
  selector: 'app-detail-cards',
  templateUrl: './detail-cards.component.html',
  styleUrls: ['./detail-cards.component.scss']
})
export class DetailCardsComponent implements OnInit {

  // The full json Data 
  public jsonData: any = [];

  // Show the progress bar or not
  public showProgressBar: boolean = false;

  // Show all Cards or not
  public showCards: boolean = false;

  // Show the specific Card or not
  public showSpecificCard: boolean = false;

  // The Event Card
  public eventCard: Card | undefined;

  // The Entity Card
  public entityCard: Card | undefined;

  // The :CORR Relationship Card
  public corrRelationShipsCard: Card | undefined;

  // The :DF Relationship Card
  public dfRelationshipCard: Card | undefined;

  // The Master Card choiched by the User
  public masterCard: MasterCard | undefined;

  /**
   * Constructor for DetailCardsComponent
   * @param httpClient the Http Client 
   */
  constructor(
    private graphService: GraphService,
    private router: Router,
    private snackBar: MatSnackBar,
  ) { }

  // NgOnInit implementation
  ngOnInit(): void {
    if (!this.graphService.hasResponse()) {
      this.openSnackBar('Error', 'Retry');
      this.router.navigateByUrl('/home');
      return;
    }
    this.showProgressBar = true;
    this.showSpecificCard = false;
    this.jsonData = this.graphService.apiResponse;
    this.injectDataToCard();
  }


  /**
   * Inject json response data to the corrispective
   * Cards
   */
  public injectDataToCard() {
    if (this.jsonData == null || this.jsonData == undefined) {
      this.openSnackBar('Error', 'Retry');
      this.router.navigateByUrl('/home');
      return;
    }

    // Create Event nodes Card
    if (this.jsonData.event_count != null && this.jsonData.event_count != undefined) {
      const cardTitle = 'Event Nodes';
      const numberOfData = this.jsonData.event_count;;
      const cardType = 'nodes';
      this.eventCard = new Card(cardTitle, cardType, numberOfData);
    }

    // Create Entity nodes Card
    if (this.jsonData.entity_count != null && this.jsonData.entity_count != undefined) {
      const cardTitle = 'Entity Nodes';
      const numberOfData = this.jsonData.entity_count;
      const cardType = 'nodes';
      this.entityCard = new Card(cardTitle, cardType, numberOfData);
    }

    // Create :CORR relationsips card
    if (this.jsonData.correlation_count != null && this.jsonData.correlation_count != undefined) {
      const cardTitle = ':CORR Relationships';
      const numberOfData = this.jsonData.correlation_count;
      const cardType = 'relationships';
      this.corrRelationShipsCard = new Card(cardTitle, cardType, numberOfData);
    }

    if (this.jsonData.df_count != null && this.jsonData.df_count != undefined) {
      const cardTitle = ':DF Relationships';
      const numberOfData = this.jsonData.df_count;
      const cardType = 'relationships';
      this.dfRelationshipCard = new Card(cardTitle, cardType, numberOfData);
    }

    this.showProgressBar = false;
    this.showCards = true;
  }

  /**
   * Close the Master Card
   * @param event the $event
   */
  public closeMasterCard(event: boolean) {
    this.showSpecificCard = false;
    this.showCards = true;
    this.masterCard = undefined;
  }

  /**
   * If we have some data for all Cards
   * @returns true if we have card data, false otherwise
   */
  public haveCardsData(): boolean {
    if (this.eventCard == undefined || this.entityCard == undefined || this.corrRelationShipsCard == undefined
      || this.dfRelationshipCard == undefined) {
      return false;
    }
    return true;
  }

  /**
   * Open Snackbar with specific message and action (button)
   * @param message the message
   * @param action the action
   */
  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }
}
