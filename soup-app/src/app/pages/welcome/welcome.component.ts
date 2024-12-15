import { Component } from '@angular/core';

import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { environment } from '../../../environments/environment';

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
