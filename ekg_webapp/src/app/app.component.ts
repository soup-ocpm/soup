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

  /**
   * Constructor class for AppComponent.
   * @param router the Router.
   */
  constructor(
    private router: Router
  ) { }

  //NgOnInit implementation method.
  ngOnInit(): void { }

}
