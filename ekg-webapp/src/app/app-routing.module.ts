import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';

// Pages component import
import {HomeComponent} from "./pages/home/home.component";
import {LoadCsvComponent} from "./pages/load-csv/load-csv.component";
import {DetailsComponent} from "./pages/details/details.component";
import {DetailsGraphComponent} from "./pages/details-graph/details-graph.component";
import {GraphComponent} from "./pages/graph/graph.component";

// All application routes
const routes: Routes = [
  {path: '', redirectTo: 'welcome', pathMatch: 'full'},
  {path: 'welcome', component: HomeComponent},
  {path: 'start', component: LoadCsvComponent},
  {path: 'details', component: DetailsComponent},
  {path: 'details-graph', component: DetailsGraphComponent},
  {path: 'graph', component: GraphComponent},

  {path: '**', redirectTo: 'welcome'}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
