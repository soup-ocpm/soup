import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-detail-cards',
  templateUrl: './detail-cards.component.html',
  styleUrls: ['./detail-cards.component.scss']
})
export class DetailCardsComponent implements OnInit {

  public showCards: boolean = true;

  public showSpecificCard: boolean = false;

  public jsonData: any = [];

  /**
   * Constructor for DetailCardsComponent
   * @param httpClient the Http Client 
   */
  constructor(
    private httpClient: HttpClient
  ) { }

  // NgOnInit implementation
  ngOnInit(): void {
    let apiResponse: any;
    this.httpClient.get('http://localhost:4200/assets/graph.json').subscribe(
      response => {
        apiResponse = response;
        this.jsonData = apiResponse;
      },
    )
  }

  public closeMasterCard(event: boolean) {
    console.log(event)
  }
}
