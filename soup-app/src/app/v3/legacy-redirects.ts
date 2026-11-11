import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';

import { ObjectRef, WorkspaceNode } from '../core/v3/v3.models';
import { V3ApiService } from '../core/v3/v3-api.service';
import { NotificationService } from '../shared/components/s-toast/toast.service';
import { notify } from './components/notify';
import { flatten } from './pages/workspace/workspace-tree';

/**
 * The addresses of the old pages, kept as redirects: /new-dataset to
 * /import, /datasets to /workspace, and the pages of a dataset or of one
 * of its analyses to /o/:id of the object of the workspace that is that
 * dataset (a root object named as it, or adopted from its folder,
 * meta.dataset) or that analysis (an object derived from it, named as it
 * or adopted from its file, meta.analysis.name). A name that matches no
 * object opens the workspace searching for it.
 */

function datasetOf(roots: readonly WorkspaceNode[], name: string): WorkspaceNode | undefined {
  return roots.find((node) => node.object.name === name) ?? roots.find((node) => node.object.meta['dataset'] === name);
}

function analysisName(object: ObjectRef): unknown {
  const info = object.meta['analysis'];
  return info && typeof info === 'object' ? (info as Record<string, unknown>)['name'] : undefined;
}

function analysisOf(dataset: WorkspaceNode, name: string): WorkspaceNode | undefined {
  const derived = flatten(dataset.children);
  return derived.find((node) => analysisName(node.object) === name) ?? derived.find((node) => node.object.name === name);
}

/** The object a legacy dataset (and analysis) address means, or null. */
export function resolveLegacy(roots: readonly WorkspaceNode[], dataset: string, analysis?: string | null): ObjectRef | null {
  const root = datasetOf(roots, dataset);
  if (!root) {
    return null;
  }
  if (!analysis) {
    return root.object;
  }
  return analysisOf(root, analysis)?.object ?? null;
}

export const legacyObjectRedirect: CanActivateFn = (route: ActivatedRouteSnapshot): Observable<UrlTree> => {
  const api = inject(V3ApiService);
  const router = inject(Router);
  const notifications = inject(NotificationService);
  const dataset = route.paramMap.get('name') ?? '';
  const analysis = route.paramMap.get('analysisName');
  const searched = analysis ?? dataset;
  const notFound = () => {
    notify(notifications, `'${searched}' is not in the workspace`, 'warning');
    return router.createUrlTree(['/workspace'], { queryParams: { search: searched } });
  };
  return api.objects().pipe(
    map((roots) => {
      const object = resolveLegacy(roots, dataset, analysis);
      return object ? router.createUrlTree(['/o', object.id]) : notFound();
    }),
    catchError(() => of(router.createUrlTree(['/workspace'])))
  );
};
