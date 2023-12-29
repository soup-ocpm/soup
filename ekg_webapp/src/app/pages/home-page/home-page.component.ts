import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GraphService } from '../../services/graph.service';


@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss']
})
export class HomePageComponent implements OnInit {

  /**
   * Constructor class for HomePageComponent
   * @param router the Router.
   * @param serviceLoad the Service for Load csv.
   */
  constructor(
    private router: Router,
    private serviceLoad: GraphService
  ) { }


  // NgOnInit implementation.
  ngOnInit(): void {
    this.serviceLoad.deleteResponse();
  }


  // Start the operation.
  startClicked() {
    this.router.navigateByUrl('/upload-csv')
  }
}
