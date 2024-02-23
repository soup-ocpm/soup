import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-card-detail',
  templateUrl: './card-detail.component.html',
  styleUrls: ['./card-detail.component.scss']
})
export class CardDetailComponent implements OnInit {

  // Title of the Card
  @Input('titleCard') title: string = '';

  // Type of the card (for Nodes or Relationships)
  @Input('cardType') cardType: string = '';

  // Number of the data (number of nodes or edges)
  @Input('numberOfData') numer: number = 0;

  // Constructor for CardDetailComponent component
  constructor() { }

  // NgOnInit implementation
  ngOnInit(): void { }

}
