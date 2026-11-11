import { JsonPipe } from '@angular/common';
import { Component, input } from '@angular/core';

/**
 * What the host shows where no installed package can display something:
 * an object of a kind without visualizers, or the blocks of an import
 * preview (until a package visualizes them). The data is shown as
 * readable JSON, as text.
 */
@Component({
  selector: 'soup-object-fallback',
  imports: [JsonPipe],
  template: `
    <div class="soup-fallback">
      <p class="text-muted mb-2">
        <i class="bi bi-puzzle"></i>
        no visualizer installed for {{ this.kind() }}
      </p>
      @if (this.data() !== undefined) {
        <pre class="soup-fallback-json">{{ this.data() | json }}</pre>
      }
    </div>
  `,
  styles: `
    .soup-fallback-json {
      max-height: 420px;
      overflow: auto;
      padding: 8px;
      background: #f6f8fa;
      border-radius: 6px;
      font-size: 0.85rem;
    }
  `
})
export class ObjectFallbackComponent {
  // The kind nothing can display
  public kind = input.required<string>();

  // The data shown as JSON
  public data = input<unknown>(undefined);
}
