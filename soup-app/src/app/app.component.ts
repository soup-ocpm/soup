import { animate, group, query, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, Renderer2 } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { FooterComponent } from './shared/components/footer/footer.component';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { GenericModalComponent } from './shared/components/s-modals/s-generic-modal/s-generic-modal.component';
import { InputModalComponent } from './shared/components/s-modals/s-input-modal/s-input-modal.component';
import { SToastComponent } from './shared/components/s-toast/s-toast.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NgbModule,
    // Component import
    NavbarComponent,
    FooterComponent,
    SToastComponent,
    GenericModalComponent,
    SidebarComponent,
    InputModalComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [
    trigger('routeAnimation', [
      transition('* => *', [
        query(':enter, :leave', style({ position: 'absolute', width: '100%' }), { optional: true }),
        group([
          query(':enter', [style({ transform: 'translateX(100%)' }), animate('350ms ease', style({ transform: 'translateX(0%)' }))], {
            optional: true
          }),
          query(':leave', [style({ transform: 'translateX(0%)' }), animate('350ms ease', style({ transform: 'translateX(-100%)' }))], {
            optional: true
          })
        ])
      ])
    ])
  ]
})
export class AppComponent {
  // Application title
  public title = 'soup-app';

  /**
   * Constructor for AppComponent component
   * @param renderer the Renderer
   */
  constructor(private renderer: Renderer2) {}

  // Initialize the route
  public prepareRoute(outlet: RouterOutlet) {
    this.renderer.setStyle(document.body, 'overflow', 'hidden');
    return outlet.isActivated ? outlet.activatedRoute : '';
  }

  // Handle the animation complete
  public onAnimationDone() {
    this.renderer.removeStyle(document.body, 'overflow');
  }
}
