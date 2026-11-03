import { Component } from '@angular/core';

/**
 * Footer component
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  // The year of the copyright, the current one
  public readonly year = new Date().getFullYear();
}
