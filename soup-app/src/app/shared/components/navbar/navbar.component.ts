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
  /**
   * Constructor for NavbarComponent component
   * @param router the Router
   */
  constructor(private router: Router) {}

  /**
   * Navigate to the home page
   */
  public goToHome(): void {
    this.router.navigate(['/welcome']);
  }

  /**
   * Go to new dataset page
   */
  public goToNewDataset(): void {
    this.router.navigate(['/new-dataset']);
  }

  /**
   * Go to manage datasets page
   */
  public goToManageDatasets(): void {
    this.router.navigate(['/datasets']);
  }
}
