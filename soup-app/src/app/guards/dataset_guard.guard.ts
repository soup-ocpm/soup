import { Injectable } from '@angular/core';
import { CanActivate, CanActivateChild, Router } from '@angular/router';

import { LocalDataService } from '../shared/services/support.service';

/**
 * Dataset auth guard
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Injectable({
  providedIn: 'root'
})
export class DatasetAuthGuard implements CanActivate, CanActivateChild {
  /**
   * Initialize a new instance of DatasetAuthGuard guard
   * @param router the Router
   * @param supportService the LocalDataService service
   */
  constructor(
    private router: Router,
    private supportService: LocalDataService
  ) {}

  /**
   * Can activate
   */
  public canActivate(): boolean {
    return this.checkCurrentData();
  }

  /**
   * Can activate child routes
   */
  public canActivateChild(): boolean {
    return this.checkCurrentData();
  }

  /**
   * Check the condition for the component route guard
   */
  private checkCurrentData(): boolean {
    const currentDataset = this.supportService.getCurrentDataset();
    if (currentDataset != null) {
      return true;
    } else {
      this.router.navigate(['/welcome']);
      return false;
    }
  }
}
