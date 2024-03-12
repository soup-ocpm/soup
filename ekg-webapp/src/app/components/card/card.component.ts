import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';

// Models import
import {Card} from "../../models/card.model";

// Other import
import {saveAs} from "file-saver";

@Component({
  selector: 'app-card',
  templateUrl: './card.component.html',
  styleUrl: './card.component.scss'
})
export class CardComponent implements OnInit {
// The Input Card model
  @Input() card: Card | undefined;

  // The EventEmitter for Card size
  @Output('haveChanged') haveChangeSize: EventEmitter<boolean> = new EventEmitter<boolean>();

  // The variable that show if the Card is expanded or not
  public expandedCard: boolean | undefined;

  // Search string text
  public searchText: string = '';

  // The filtered data
  public filteredData: any;

  // Constructor of CardComponent component
  constructor() {
  }

  // NgOnInit implementation
  ngOnInit(): void {
    this.expandedCard = false;
    this.filteredData = this.card?.jsonData;
  }

  // Change the Card size
  public dimensionCard(): void {
    this.expandedCard = !this.expandedCard;
    this.haveChangeSize.emit(this.expandedCard);
  }

  // Method that call when User input string
  updateSearch(): void {
    if (!this.searchText.trim()) {
      this.filteredData = this.card?.jsonData;
    } else {
      this.filteredData = this.filterData(this.card?.jsonData, this.searchText);
    }
  }

  /**
   * Filter the json data
   * @param data the data
   * @param searchText the search text
   */
  filterData(data: any, searchText: string): any {
    if (!searchText.trim()) {
      return data;
    }

    const filtered: any = Array.isArray(data) ? [] : {};
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (typeof value === 'object') {
        const filteredValue = this.filterData(value, searchText);
        if (filteredValue !== null && Object.keys(filteredValue).length > 0) {
          filtered[key] = filteredValue;
        }
      } else if (typeof value === 'string' && value.toLowerCase().includes(searchText.toLowerCase())) {
        filtered[key] = value;
      }
    });
    return Object.keys(filtered).length > 0 ? filtered : null;
  }

  /**
   * Allow the User to download JSON data
   */
  public downloadJson(): void {
    const jsonContent = this.card?.jsonData;
    if (jsonContent != null) {
      const jsonString = JSON.stringify(jsonContent, null, 2);
      const svgBlob = new Blob([jsonString], {type: 'json'});
      saveAs(svgBlob, `${this.card?.title}.json`);
    }
  }
}
