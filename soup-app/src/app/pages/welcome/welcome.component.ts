import { Component } from '@angular/core';

import { environment } from '../../../environments/environment';
import { SButtonComponent } from '../../core/components/s-buttons/s-button/s-button.component';

import { SpBtnComponent } from '@aledevsharp/sp-lib';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [SButtonComponent, SpBtnComponent],
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
