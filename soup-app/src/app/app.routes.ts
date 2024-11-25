import { Routes } from '@angular/router';

import { DatasetAuthGuard } from './guards/dataset_guard.guard';
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
    data: { animation: 'NewDatasetPage' }
  },
  {
    path: 'datasets',
    loadComponent: () => import('./pages/retrive-dataset/retrive-dataset.component').then((c) => c.RetriveDatasetComponent),
    data: { animation: 'DatasetsPage' }
  },
  {
    path: 'datasets/:name',
    loadComponent: () => import('./pages/details-dataset/details-dataset.component').then((c) => c.DetailsDatasetComponent),
    data: { animation: 'DetailsDatasetPage' },
    canActivate: [DatasetAuthGuard]
  },
  {
    path: 'datasets/:name/graph',
    loadComponent: () => import('./pages/dagre-d3/dagre-d3.component').then((c) => c.DagreD3Component),
    data: { animatation: 'GraphDatasetPage' }
  },
  {
    path: 'dagre',
    loadComponent: () => import('./pages/dagre-d3/dagre-d3.component').then((c) => c.DagreD3Component),
    data: { animatation: 'DagreD3Page' }
  },
  {
    path: '**',
    redirectTo: 'welcome'
  }
];
