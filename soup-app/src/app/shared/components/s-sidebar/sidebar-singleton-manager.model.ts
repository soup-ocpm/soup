import { Injectable } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { SidebarService } from './sidebar.service';

@Injectable({
  providedIn: 'root'
})
export class SidebarManager {
  /**
   * Initialize the SidebarManager singleton service
   * @param router the Router
   * @param sidebarService the SidebarService service
   */
  constructor(
    private sidebarService: SidebarService,
    private router: Router
  ) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        // Rese the sidebar map
        this.sidebarService.clearAllSidebars();
      }
    });
  }
}
