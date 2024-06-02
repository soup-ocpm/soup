import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';

// Models import
import {Card} from "../../core/models/card.model";

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

  // Original search text
  public originalSearchText = '';

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
  public updateSearch() {
    if (this.searchText.trim()) {
      this.filteredData = [];
      this.searchInJson(this.card?.jsonData, this.searchText, this.filteredData);
      this.originalSearchText = this.searchText;
    } else {
      this.filteredData = [];
    }
  }

  public searchInJson(json: any, keyword: string, results: any[]): boolean {
    let found = false;

    if (typeof json === 'string') {
      return json.includes(keyword);
    }

    if (Array.isArray(json)) {
      for (let item of json) {
        if (this.searchInJson(item, keyword, results)) {
          found = true;
        }
      }
    } else if (typeof json === 'object') {
      for (let key in json) {
        if (json.hasOwnProperty(key)) {
          if (this.searchInJson(json[key], keyword, results)) {
            found = true;
          }
        }
      }
      if (found) {
        results.push(json);
      }
    }
    return found;
  }

  public clearSearch() {
    this.searchText = '';
    this.filteredData = [];
    this.originalSearchText = '';
  }

  public handleSearchClick() {
    if (this.searchText === this.originalSearchText && this.searchText.trim()) {
      this.clearSearch();
    } else {
      this.updateSearch();
    }
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
