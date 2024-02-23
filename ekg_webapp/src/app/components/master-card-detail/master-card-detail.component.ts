import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-master-card-detail',
  templateUrl: './master-card-detail.component.html',
  styleUrls: ['./master-card-detail.component.scss']
})
export class MasterCardDetailComponent implements OnInit {

  @Input('title') cardTitle: string = '';

  @Input('description') cardDescription: string = '';

  @Input('jsonData') cardData: any;

  // Close Card event emitted
  @Output('closeCardEmit') closeCardEmit = new EventEmitter<boolean>;

  searchText: string = '';

  filteredData: any;

  constructor() { }

  // NgOnInit implementation
  ngOnInit(): void {

  }

  updateSearch() {
    if (!this.searchText.trim()) {
      this.filteredData = this.cardData;
    } else {
      this.filteredData = this.filterData(this.cardData, this.searchText);
    }
  }

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

  // Close card event emitter 
  public closeMasterCard() {
    this.closeCardEmit.emit(true);
  }

}
