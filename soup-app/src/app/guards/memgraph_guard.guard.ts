import { Injectable } from '@angular/core';
import { CanActivate, CanActivateChild, Router } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';

import { EngineService } from '../core/services/engine.service';
import { LoggerService } from '../core/services/logger.service';
import { NotificationService } from '../shared/components/s-toast/toast.service';
import { ToastLevel } from '../shared/components/s-toast/toast_type.enum';

@Injectable({
  providedIn: 'root'
})
export class MemgraphAuthGuard implements CanActivate, CanActivateChild {
  /**
   * Initialize a new instance of MemgraphAuthGuard guard
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
    return this.checkMemgraphConnection();
  }

  /**
   * Can activate child routes
   */
  public canActivateChild(): Observable<boolean> {
    return this.checkMemgraphConnection();
  }

  /**
   * Check the condition for the component route guard
   */
  private checkMemgraphConnection(): Observable<boolean> {
    return this.engineService.testMemgraphConnection().pipe(
      map((response) => {
        if (response.statusCode === 200) {
          this.logger.info('Success connect with Memgraph...');
          this.engineService.setMemgraphConnection(true);
          return true;
        } else {
          this.logger.warn('SOuP Database is down');
          this.engineService.setMemgraphConnection(false);
          this.toast.show('The Database is down. Please start the Memgraph Database', ToastLevel.Warning, 4000);
          this.router.navigate(['/welcome']);
          return false;
        }
      }),
      catchError(() => {
        this.logger.warn('SOuP Database is down');
        this.engineService.setMemgraphConnection(false);
        this.toast.show('The Database is down. Please start the Memgraph Database', ToastLevel.Warning, 4000);
        this.router.navigate(['/welcome']);
        return of(false);
      })
    );
  }
}
