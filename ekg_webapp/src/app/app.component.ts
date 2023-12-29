import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  // App title
  title = 'Control Graph';

  /**
   * Boolean variable that indicate if the user
   * stay in home page.
   */
  isHome = false;

  // Welcome page link.
  welcomeLink = '/welcome';

  // Upload page link.
  uploadLink = '/upload-csv';

  // Connection page link.
  connectLink = '/connect';


  /**
   * Constructor class for AppComponent.
   * @param router the Router.
   */
  constructor(
    private router: Router
  ) { }


  //NgOnInit implementation method.
  ngOnInit(): void {
    this.isHome = true;
  }


  // Method that send User to home page.
  goToHome() {
    this.isHome = true;
    this.router.navigateByUrl('/welcome')
  }


  // Method that send User to start page.
  goToStart() {
    this.isHome = false;
    this.router.navigateByUrl('/upload-csv')
  }
}
