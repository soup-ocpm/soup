import { Routes } from '@angular/router';

import { DatasetAuthGuard } from './guards/dataset_guard.guard';
import { EngineAuthGuard } from './guards/engine_guard.guard';
import { MemgraphAuthGuard } from './guards/memgraph_guard.guard';
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
    canActivate: [EngineAuthGuard, MemgraphAuthGuard]
  },
  {
    path: 'datasets',
    loadComponent: () => import('./pages/retrive-dataset/retrive-dataset.component').then((c) => c.RetriveDatasetComponent),
    data: { animation: 'DatasetsPage' },
    canActivate: [EngineAuthGuard, MemgraphAuthGuard]
  },
  {
    path: 'datasets/:name',
    loadComponent: () => import('./pages/details-dataset/details-dataset.component').then((c) => c.DetailsDatasetComponent),
    data: { animation: 'DetailsDatasetPage' },
    canActivate: [EngineAuthGuard, MemgraphAuthGuard, DatasetAuthGuard]
  },
  {
    path: 'datasets/:name/graph',
    loadComponent: () => import('./pages/graph-dataset/graph.component').then((c) => c.GraphComponent),
    data: { animatation: 'GraphDatasetPage' },
    canActivate: [EngineAuthGuard, MemgraphAuthGuard, DatasetAuthGuard]
  },
  {
    path: '**',
    redirectTo: 'welcome'
  }
];
