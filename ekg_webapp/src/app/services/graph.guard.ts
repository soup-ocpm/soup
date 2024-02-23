import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { GraphService } from './graph.service';


@Injectable({
    providedIn: 'root'
})
export class CanActivateGraphGuard implements CanActivate {


    /**
     * Constructor for CanActivateGraphGuard guard
     * @param router the Router
     * @param loadPageService the LoadPageService service
     */
    public constructor(
        private router: Router,
        private loadPageService: GraphService,
    ) { }


    //CanActivate method implementation
    public canActivate(
        next: ActivatedRouteSnapshot,
        state: RouterStateSnapshot): boolean {
        if (this.loadPageService.hasResponse()) {
            return true;
        } else {
            this.router.navigate(['/welcome']);
            return false;
        }
    }
}