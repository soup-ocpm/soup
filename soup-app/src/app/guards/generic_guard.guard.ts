import { Injectable } from '@angular/core';
import { CanActivate, CanActivateChild, Router } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';

import { ToastLevel } from '../core/enums/toast_type.enum';
import { EngineService } from '../core/services/engine.service';
import { LoggerService } from '../core/services/logger.service';
import { NotificationService } from '../core/services/toast.service';

@Injectable({
  providedIn: 'root'
})
export class GenericAuthGuard implements CanActivate, CanActivateChild {
  /**
   * Initialize a new instance of AuthGuard guard
   * @param router the Router
   * @param engineService the EngineService service
   * @param logger the LoggerService service
   * @param toast the NotificationService service
   */
  constructor(
    private router: Router,
    private engineService: EngineService,
    private logger: LoggerService,
    private toast: NotificationService
  ) {}

  /**
   * Can activate
   */
  public canActivate(): Observable<boolean> {
    return this.checkCurrentData();
  }

  /**
   * Can activate child routes
   */
  public canActivateChild(): Observable<boolean> {
    return this.checkCurrentData();
  }

  /**
   * Check the condition for the component route guard
   */
  private checkCurrentData(): Observable<boolean> {
    return this.engineService.testEngineConnection().pipe(
      map((response) => {
        if (response.statusCode === 200) {
          this.logger.info('Success connect with Engine...');
          this.engineService.setSuccessConnection(true);
          return true;
        } else {
          this.logger.warn('SOuP Engine down');
          this.engineService.setSuccessConnection(false);
          this.toast.show('The Engine is down. Please start the Engine', ToastLevel.Warning, 4000);
          this.router.navigate(['/welcome']);
          return false;
        }
      }),
      catchError(() => {
        this.logger.warn('SOuP Engine down');
        this.engineService.setSuccessConnection(false);
        this.toast.show('The Engine is down. Please start the Engine', ToastLevel.Warning, 4000);
        this.router.navigate(['/welcome']);
        return of(false);
      })
    );
  }
}
