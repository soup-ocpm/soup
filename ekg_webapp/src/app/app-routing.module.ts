import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// COMPONENT PAGE IMPORT
import { HomePageComponent } from './pages/home-page/home-page.component';
import { LoadPageComponent } from './pages/load-page/load-page.component';
import { DetailCardsComponent } from './pages/detail-cards/detail-cards.component';
import { GraphPageComponent } from './pages/graph-page/graph-page.component';

// AUTHGUARD IMPORT
import { CanActivateGraphGuard } from './guard/ekg.guard';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomePageComponent },
  { path: 'upload-data', component: LoadPageComponent },
  { path: 'details', component: DetailCardsComponent },
  { path: 'graph', component: GraphPageComponent,  }, //canActivate: [CanActivateGraphGuard]
  { path: '**', redirectTo: 'home' },
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})


export class AppRoutingModule { }
