import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { Component } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Home page  component
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [SpBtnComponent],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss'
})
export class WelcomeComponent {
  /**
   * Constructor for WelcomeComponent component
   * @param standardGraphService the StandardGraphService service
   */
  constructor() {}

  /**
   * Go to the documentation SOuP page
   */
  public onGoDocumentation(): void {
    window.open(environment.prosLabUrl, '_blank');
  }
}
