import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Block, defineSoupElement, ReportData, VisualizerContext } from '@soup/sdk';
import { of } from 'rxjs';

import { createSpyObj, SpyObj } from '../../../testing/spy-obj';
import { FrontendPackageStatus, PackageLoaderService } from '../../core/v3/package-loader.service';
import { VisualizerInfo } from '../../core/v3/v3.models';
import { V3ApiService } from '../../core/v3/v3-api.service';
import { NotificationService } from '../../shared/components/s-toast/toast.service';
import { BlocksPreviewComponent } from './blocks-preview.component';

/** Stands for soup_base's <soup-report-view>. */
class FakeReportView extends HTMLElement {
  public data!: ReportData;
  public context!: VisualizerContext;
}
defineSoupElement('soup-fake-report-view', FakeReportView);

const REPORT_VIEW: VisualizerInfo = {
  id: 'soup_base.report',
  label: 'Report',
  package: 'soup_base',
  element: 'soup-fake-report-view',
  module_url: '/api/v3/packages/soup_base/app/index.js'
};

const BLOCKS: Block[] = [{ type: 'text', title: 'First lines', data: { text: 'a\nb' } }];

async function until(condition: () => boolean, fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();
  }
  expect(condition(), 'condition not reached').toBe(true);
}

describe('BlocksPreviewComponent', () => {
  let api: SpyObj<V3ApiService>;
  let statuses: ReturnType<typeof signal<ReadonlyMap<string, FrontendPackageStatus>>>;
  let fixture: ComponentFixture<BlocksPreviewComponent>;

  beforeEach(async () => {
    api = createSpyObj<V3ApiService>(['visualizersForKind', 'visualizerData', 'setThumbnail']);
    statuses = signal<ReadonlyMap<string, FrontendPackageStatus>>(new Map());
    const loader = { statuses, ensureLoaded: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [BlocksPreviewComponent],
      providers: [
        { provide: V3ApiService, useValue: api },
        { provide: PackageLoaderService, useValue: loader },
        { provide: Router, useValue: createSpyObj<Router>(['navigate']) },
        { provide: NotificationService, useValue: createSpyObj<NotificationService>(['show']) }
      ]
    }).compileComponents();
  });

  function render(): void {
    fixture = TestBed.createComponent(BlocksPreviewComponent);
    fixture.componentRef.setInput('blocks', BLOCKS);
    fixture.componentRef.setInput('name', 'notes');
    fixture.detectChanges();
  }

  const host = () => fixture.nativeElement as HTMLElement;

  it('draws the blocks with the visualizer of "report", without asking an object', async () => {
    api.visualizersForKind.mockReturnValue(of([REPORT_VIEW]));
    render();

    await until(() => host().querySelector('soup-fake-report-view') !== null, fixture);
    const element = host().querySelector('soup-fake-report-view') as FakeReportView;

    expect(api.visualizersForKind).toHaveBeenCalledWith('report');
    expect(element.data).toEqual({ blocks: BLOCKS, name: 'notes' });
    expect(api.visualizerData).not.toHaveBeenCalled();
    await expect(element.context.action('anything')).rejects.toThrow(/does not show an object/);
    // A thumbnail of a preview belongs to no object.
    element.context.setThumbnail('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(api.setThumbnail).not.toHaveBeenCalled();
  });

  it('without a visualizer of "report" says so and shows the blocks as JSON', async () => {
    api.visualizersForKind.mockReturnValue(of([]));
    render();

    await until(() => (host().textContent ?? '').includes('no visualizer installed for report'), fixture);
    expect(host().textContent).toContain('First lines');
  });

  it('looks the visualizers up again when the frontend packages change', async () => {
    api.visualizersForKind.mockReturnValue(of([REPORT_VIEW]));
    render();
    await until(() => host().querySelector('soup-fake-report-view') !== null, fixture);

    // soup_base disabled from /packages
    api.visualizersForKind.mockReturnValue(of([]));
    statuses.set(new Map());
    fixture.detectChanges();

    await until(() => host().querySelector('soup-fake-report-view') === null, fixture);
    expect(host().textContent).toContain('no visualizer installed for report');
    expect(api.visualizersForKind).toHaveBeenCalledTimes(2);
  });
});
