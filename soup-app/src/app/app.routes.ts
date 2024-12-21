import { Routes } from '@angular/router';

import { DatasetAuthGuard } from './guards/dataset_guard.guard';
import { GenericAuthGuard } from './guards/generic_guard.guard';
import { WelcomeComponent } from './pages/welcome/welcome.component';

// Application routes
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'welcome'
  },
  {
    path: 'welcome',
    component: WelcomeComponent
  },
  {
    path: 'new-dataset',
    loadComponent: () => import('./pages/new-dataset/new-dataset.component').then((c) => c.NewDatasetComponent),
    data: { animation: 'NewDatasetPage' },
    canActivate: [GenericAuthGuard]
  },
  {
    path: 'datasets',
    loadComponent: () => import('./pages/retrive-dataset/retrive-dataset.component').then((c) => c.RetriveDatasetComponent),
    data: { animation: 'DatasetsPage' },
    canActivate: [GenericAuthGuard]
  },
  {
    path: 'datasets/:name',
    loadComponent: () => import('./pages/details-dataset/details-dataset.component').then((c) => c.DetailsDatasetComponent),
    data: { animation: 'DetailsDatasetPage' },
    canActivate: [DatasetAuthGuard, GenericAuthGuard]
  },
  {
    path: 'datasets/:name/graph',
    loadComponent: () => import('./pages/graph-dataset/graph.component').then((c) => c.GraphComponent),
    data: { animatation: 'GraphDatasetPage' },
    canActivate: [DatasetAuthGuard, GenericAuthGuard]
  },
  {
    path: '**',
    redirectTo: 'welcome'
  }
];
