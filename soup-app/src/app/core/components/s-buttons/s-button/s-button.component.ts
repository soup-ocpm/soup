import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-s-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './s-button.component.html',
  styleUrl: './s-button.component.scss'
})
export class SButtonComponent {
  // The button text
  @Input() text = '';

  // The button color
  @Input() color = 'var(--primary-color)';

  // The button height
  @Input() height = '30px';

  // The button cursor
  @Input() cursor = 'pointer';

  // If the button is disabled
  @Input() disabled = false;

  // Handle the output
  @Output() buttonClick = new EventEmitter<void>();

  // Constructor for SButtonComponent button
  constructor() {}

  /**
   * Click button
   */
  public onClick(): void {
    this.buttonClick.emit();
  }
}
