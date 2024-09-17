import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

// Component import
import { RetrieveCardComponent } from '../../components/retrieve-card/retrieve-card.component';

// Material import
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {

  /**
   * Constructor for HomeComponent component
   * @param router the Router
   * @param dialog the Material dialog
   */
  constructor(
    private router: Router,
    private dialog: MatDialog,
  ) {
  }

  // NgOnInit implementation
  ngOnInit(): void {
  }

  // Handle the click to start button
  public onStartClick(): void {
    this.router.navigate(['/start']);
  }

  // Handle the retrieve graph
  public onRetrieveClick(): void {
    this.dialog.open(RetrieveCardComponent);
  }
}
