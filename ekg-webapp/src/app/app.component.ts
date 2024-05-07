import {Component, OnInit} from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {

  // App title
  public title: string = 'SOuP';

  // Constructor for AppComponent component
  constructor() {
  }

  // NgOnInit implementation
  ngOnInit(): void {
  }
}
