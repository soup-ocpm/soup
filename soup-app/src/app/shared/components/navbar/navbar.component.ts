import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  // The proslab unicam link
  public prosLabLink = 'https://pros.unicam.it/soup/';

  /**
   * Constructor for NavbarComponent component
   * @param router the Router
   */
  constructor(private router: Router) {}

  // Navigate to the home page
  public handleGoHome() {
    this.router.navigate(['/welcome']);
  }

  // Go to Help SOuP page
  public handleGoHelp() {
    window.open(this.prosLabLink, '_blank');
  }
}
