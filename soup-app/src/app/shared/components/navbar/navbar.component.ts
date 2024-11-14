import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
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
    window.open(environment.prosLabUrl, '_blank');
  }
}
