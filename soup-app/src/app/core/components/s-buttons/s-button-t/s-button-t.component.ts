import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-s-button-t',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './s-button-t.component.html',
  styleUrl: './s-button-t.component.scss'
})
export class SButtonTComponent {
  // The button text
  @Input() text = '';

  // The button color
  @Input() color = 'var(--primary-color)';

  // If the button is disabled or not
  @Input() disabled = false;

  // The button cursor
  @Input() cursor = 'pointer';

  // Handle the output
  @Output() buttonClick = new EventEmitter<void>();

  // Constructor for SButtonTComponent component
  constructor() {}

  /**
   * Click button
   */
  public onClick(): void {
    this.buttonClick.emit();
  }
}
