import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { defineSoupElement, dispatchSoupEvent, ObjectRef, SOUP_EVENTS, VisualizerContext } from '@soup/sdk';
import { of, throwError } from 'rxjs';

import { createSpyObj, SpyObj } from '../../../testing/spy-obj';
import { ApiResponse } from '../../core/models/api_response.model';
import { PackageLoaderService } from '../../core/v3/package-loader.service';
import { VisualizerInfo } from '../../core/v3/v3.models';
import { V3ApiService } from '../../core/v3/v3-api.service';
import { NotificationService } from '../../shared/components/s-toast/toast.service';
import { VisualizerHostComponent } from './visualizer-host.component';

/** A visualizer element as a package would define it: it records what the host gives it. */
class FakeViewer extends HTMLElement {
  public static last: FakeViewer | null = null;
  public data: unknown;
  public context!: VisualizerContext;
  public dataWhenConnected: unknown;

  public connectedCallback(): void {
    FakeViewer.last = this;
    this.dataWhenConnected = this.data;
    this.textContent = 'fake viewer';
  }
}
defineSoupElement('soup-fake-viewer', FakeViewer);

const OBJECT: ObjectRef = {
  id: 'obj-1',
  name: 'orders',
  kind: 'table',
  created_by: { type: 'importer', contributor_id: 'feat.csv', package: 'feat' },
  parents: [],
  created_at: '2025-01-01T10:00:00.000',
  description: '',
  meta: { rows: 3, columns: ['a', 'b'] }
};

const VIEWER: VisualizerInfo = {
  id: 'feat.table',
  label: 'Table',
  package: 'feat',
  element: 'soup-fake-viewer',
  module_url: '/api/v3/packages/feat/app/index.js'
};

async function until(condition: () => boolean, fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();
  }
  expect(condition(), 'condition not reached').toBe(true);
}

describe('VisualizerHostComponent', () => {
  let fixture: ComponentFixture<VisualizerHostComponent>;
  let api: SpyObj<V3ApiService>;
  let loader: SpyObj<PackageLoaderService>;
  let router: SpyObj<Router>;
  let notifications: SpyObj<NotificationService>;

  beforeEach(async () => {
    FakeViewer.last = null;
    api = createSpyObj<V3ApiService>(['visualizerData', 'visualizerAction', 'setThumbnail']);
    api.visualizerData.mockReturnValue(of({ rows: [[1, 2]] }));
    api.visualizerAction.mockReturnValue(of({ page: 2 }));
    api.setThumbnail.mockReturnValue(of(undefined));
    loader = createSpyObj<PackageLoaderService>(['ensureLoaded']);
    loader.ensureLoaded.mockResolvedValue(undefined);
    router = createSpyObj<Router>(['navigate']);
    router.navigate.mockResolvedValue(true);
    notifications = createSpyObj<NotificationService>(['show']);

    await TestBed.configureTestingModule({
      imports: [VisualizerHostComponent],
      providers: [
        { provide: V3ApiService, useValue: api },
        { provide: PackageLoaderService, useValue: loader },
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: notifications }
      ]
    }).compileComponents();
  });

  function render(visualizer: VisualizerInfo | null): void {
    fixture = TestBed.createComponent(VisualizerHostComponent);
    fixture.componentRef.setInput('object', OBJECT);
    fixture.componentRef.setInput('visualizer', visualizer);
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('creates the element of the visualizer with its data and context', async () => {
    render(VIEWER);
    await until(() => FakeViewer.last !== null, fixture);

    const element = FakeViewer.last!;
    expect(loader.ensureLoaded).toHaveBeenCalledWith('feat');
    expect(api.visualizerData).toHaveBeenCalledWith('obj-1', 'feat.table');
    expect(element.dataWhenConnected).toEqual({ rows: [[1, 2]] });
    expect(element.context.object).toEqual(OBJECT);
    expect(element.context.theme).toBe('light');
    expect((fixture.nativeElement as HTMLElement).querySelector('soup-fake-viewer')).toBe(element);

    await expect(element.context.action<{ page: number }>('page', { n: 2 })).resolves.toEqual({ page: 2 });
    expect(api.visualizerAction).toHaveBeenCalledWith('obj-1', 'feat.table', 'page', { n: 2 });
  });

  it('forwards the DOM events of the element to the host', async () => {
    const thumbnails: string[] = [];
    render(VIEWER);
    fixture.componentInstance.thumbnailChanged.subscribe((svg) => thumbnails.push(svg));
    await until(() => FakeViewer.last !== null, fixture);
    const element = FakeViewer.last!;

    element.context.openObject('obj-2');
    dispatchSoupEvent(element, SOUP_EVENTS.notify, { message: 'done', level: 'warning' });
    element.context.setThumbnail('<svg xmlns="http://www.w3.org/2000/svg"/>');
    // An event dispatched by a descendant bubbles to the host too.
    const inner = document.createElement('span');
    element.appendChild(inner);
    dispatchSoupEvent(inner, SOUP_EVENTS.openObject, { id: 'obj-3' });

    expect(router.navigate).toHaveBeenCalledWith(['/o', 'obj-2']);
    expect(router.navigate).toHaveBeenCalledWith(['/o', 'obj-3']);
    expect(notifications.show).toHaveBeenCalledWith('done', expect.any(Number), expect.any(Number));
    expect(api.setThumbnail).toHaveBeenCalledWith('obj-1', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(thumbnails).toEqual(['<svg xmlns="http://www.w3.org/2000/svg"/>']);
  });

  it('turns a failed action into an Error for the element', async () => {
    api.visualizerAction.mockReturnValue(throwError(() => new ApiResponse(404, null, "Visualizer has no action 'x'")));
    render(VIEWER);
    await until(() => FakeViewer.last !== null, fixture);

    await expect(FakeViewer.last!.context.action('x')).rejects.toThrow(/^Visualizer has no action 'x'$/);
  });

  it('without a visualizer says none is installed for the kind and shows the meta as JSON', () => {
    render(null);

    expect(text()).toContain('no visualizer installed for table');
    expect(text()).toContain('"rows": 3');
    expect(loader.ensureLoaded).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('soup-fake-viewer')).toBeNull();
  });

  it('shows the load error of the package and mounts nothing', async () => {
    loader.ensureLoaded.mockRejectedValue(new Error('SyntaxError in bundle'));
    render(VIEWER);

    await until(() => text().includes('SyntaxError in bundle'), fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('soup-fake-viewer')).toBeNull();
  });

  it('refuses an invalid element name', async () => {
    render({ ...VIEWER, element: 'notcustom' });

    await until(() => text().includes('invalid element name'), fixture);
    expect(loader.ensureLoaded).not.toHaveBeenCalled();
  });

  it('replaces the element when the visualizer changes, and removes it when destroyed', async () => {
    render(VIEWER);
    await until(() => FakeViewer.last !== null, fixture);
    const first = FakeViewer.last!;

    fixture.componentRef.setInput('visualizer', { ...VIEWER, id: 'feat.other' });
    fixture.detectChanges();
    await until(() => FakeViewer.last !== first, fixture);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('soup-fake-viewer').length).toBe(1);
    expect(api.visualizerData).toHaveBeenCalledWith('obj-1', 'feat.other');

    const host = fixture.nativeElement as HTMLElement;
    fixture.destroy();
    expect(host.querySelector('soup-fake-viewer')).toBeNull();
  });
});
