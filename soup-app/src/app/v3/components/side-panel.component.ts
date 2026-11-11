import { afterNextRender, Component, ElementRef, inject, input, OnDestroy, output } from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

let panels = 0;

/**
 * <soup-side-panel [heading] [description] (closed)> - a modal panel: a
 * drawer on the right from 768 px, a centered dialog below. The body is the
 * projected content, the buttons the content marked `soup-panel-footer`
 * (aligned at the bottom, always visible). Keyboard: the focus goes to the
 * first control and stays in the panel (Tab cycles), Esc or the backdrop
 * emit `closed`; when the panel leaves the page the focus returns to the
 * element that had it when it opened (e.g. the card that opened it).
 * The parent shows it with @if and removes it on `closed`.
 */
@Component({
  selector: 'soup-side-panel',
  template: `
    <div
      class="soup-side-backdrop"
      aria-hidden="true"
      (click)="this.closed.emit()"></div>
    <section
      class="soup-side"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      [attr.aria-labelledby]="this.titleId"
      [attr.aria-describedby]="this.description() ? this.descriptionId : null"
      (keydown)="this.onKeydown($event)">
      <header class="soup-side-head">
        <div class="soup-side-titles">
          <h2
            class="soup-side-title"
            [id]="this.titleId">
            {{ this.heading() }}
          </h2>
          @if (this.description()) {
            <p
              class="soup-side-description"
              [id]="this.descriptionId">
              {{ this.description() }}
            </p>
          }
        </div>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary soup-icon-btn soup-side-close"
          aria-label="Close"
          title="Close"
          (click)="this.closed.emit()">
          <i
            class="bi bi-x-lg"
            aria-hidden="true"></i>
        </button>
      </header>
      <div class="soup-side-body">
        <ng-content></ng-content>
      </div>
      <footer class="soup-side-footer">
        <ng-content select="[soup-panel-footer]"></ng-content>
      </footer>
    </section>
  `,
  styleUrl: './side-panel.component.scss'
})
export class SidePanelComponent implements OnDestroy {
  public heading = input.required<string>();
  public description = input('');

  public closed = output<void>();

  public readonly titleId = `soup-side-title-${++panels}`;
  public readonly descriptionId = `soup-side-description-${panels}`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  // The element focused when the panel opened, focused again when it closes
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor() {
    afterNextRender(() => {
      const body = this.host.nativeElement.querySelector<HTMLElement>('.soup-side-body');
      const first = body?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? this.panel())?.focus();
    });
  }

  public ngOnDestroy(): void {
    if (this.opener?.isConnected) {
      this.opener.focus();
    }
  }

  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
    } else if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private panel(): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('.soup-side');
  }

  /** Tab on the last control goes to the first, Shift+Tab on the first to the last. */
  private trapFocus(event: KeyboardEvent): void {
    const controls = Array.from(this.panel()?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      (element) => !element.closest('[hidden]')
    );
    if (!controls.length) {
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === this.panel())) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
