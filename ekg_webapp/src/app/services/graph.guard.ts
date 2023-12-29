import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { GraphService } from './graph.service';


@Injectable({
    providedIn: 'root'
})
export class CanActivateGraphGuard implements CanActivate {


    /**
     * Constructor of GraphGuard
     * @param loadPageService the service for LoadPageComponent
     */
    public constructor(
        private router: Router,
        private loadPageService: GraphService,
    ) { }


    //canActivate method implementation
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