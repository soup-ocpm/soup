import { Component, OnInit, signal } from '@angular/core';

import { Health } from '../../core/v3/v3.models';
import { V3ApiService } from '../../core/v3/v3-api.service';
import { SpBtnComponent } from '../../shared/components/sp-btn/sp-btn.component';

/**
 * Home page component: what SOUP Studio is, the link to its documentation and
 * the state of the tools (GET /api/v3/health): every tool of the
 * packages, whether it answers, and the problems when the state is
 * degraded. Without an answer, the Engine is off.
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-welcome',
  imports: [SpBtnComponent],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss'
})
export class WelcomeComponent implements OnInit {
  // The answer of /api/v3/health, null until it arrives
  public readonly health = signal<Health | null>(null);

  // The Engine did not answer
  public readonly engineOff = signal(false);

  /**
   * Constructor for WelcomeComponent component
   * @param api the V3ApiService service
   */
  constructor(private api: V3ApiService) {}

  public ngOnInit(): void {
    this.api.health().subscribe({
      next: (health) => this.health.set(health),
      error: () => this.engineOff.set(true)
    });
  }

  /**
   * Open the SOUP Studio documentation
   */
  public onGoDocumentation(): void {
    window.open('https://soup-ocpm.github.io/', '_blank', 'noopener,noreferrer');
  }
}
