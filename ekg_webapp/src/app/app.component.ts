import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  // App title
  title = 'Easy Knowledge Graph';

  // Constructor for AppComponent component
  constructor(
  ) { }

  //NgOnInit implementation method.
  ngOnInit(): void { }

}
