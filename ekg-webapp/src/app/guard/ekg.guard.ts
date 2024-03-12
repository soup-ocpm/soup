import {Injectable} from '@angular/core';
import {CanActivate, Router} from "@angular/router";
import {Observable} from "rxjs";

// Services import
import {StandardGraphService} from "../services/standard_graph.service";

@Injectable({
  providedIn: 'root'
})
export class CanActivateGraphGuard implements CanActivate {

  /**
   * Constructor for CanActivateGraphGuard guard
   * @param router the Router
   * @param standardGraphService the StandardGraphService service
   */
  constructor(
    private router: Router,
    private standardGraphService: StandardGraphService,
  ) {
  }

  // CanActive method implementation
  public canActivate(): Promise<boolean> | Observable<boolean> | boolean {
    if (this.standardGraphService.hasResponse()) {
      return true;
    } else {
      this.router.navigate(['/welcome']);
      return false;
    }
  }
}
