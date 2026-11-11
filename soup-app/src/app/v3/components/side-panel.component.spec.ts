import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SidePanelComponent } from './side-panel.component';

@Component({
  imports: [SidePanelComponent],
  template: `
    <button
      type="button"
      class="opener"
      (click)="this.open.set(true)">
      Open
    </button>
    @if (this.open()) {
      <soup-side-panel
        heading="New analysis"
        description="Filter the EKG"
        (closed)="this.close()">
        <input
          class="first"
          aria-label="Name" />
        <ng-container soup-panel-footer>
          <button
            type="button"
            class="run">
            Run
          </button>
        </ng-container>
      </soup-side-panel>
    }
  `
})
class HostComponent {
  public readonly open = signal(false);
  public closes = 0;

  public close(): void {
    this.closes++;
    this.open.set(false);
  }
}

describe('SidePanelComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const element = () => fixture.nativeElement as HTMLElement;

  async function openFromOpener(): Promise<HTMLButtonElement> {
    const opener = element().querySelector('.opener') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await fixture.whenStable();
    return opener;
  }

  function key(target: Element, name: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('is a labelled modal dialog with the body and the buttons at the bottom', async () => {
    await openFromOpener();

    const dialog = element().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('New analysis');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent?.trim()).toBe('Filter the EKG');
    expect(dialog.querySelector('.soup-side-body .first')).not.toBeNull();
    expect(dialog.querySelector('.soup-side-footer .run')).not.toBeNull();
  });

  it('focuses the first control, Esc closes and gives the focus back to the opener', async () => {
    const opener = await openFromOpener();
    expect(document.activeElement).toBe(element().querySelector('.first'));

    key(element().querySelector('.first')!, 'Escape');

    expect(fixture.componentInstance.closes).toBe(1);
    expect(element().querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside the panel', async () => {
    await openFromOpener();
    const run = element().querySelector('.run') as HTMLElement;
    const close = element().querySelector('.soup-side-close') as HTMLElement;

    run.focus();
    expect(key(run, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    expect(key(close, 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(run);
  });

  it('the close button and the backdrop emit closed', async () => {
    await openFromOpener();
    (element().querySelector('.soup-side-close') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.closes).toBe(1);

    await openFromOpener();
    (element().querySelector('.soup-side-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.closes).toBe(2);
  });
});
