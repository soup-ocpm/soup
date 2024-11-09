import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-s-divider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './s-divider.component.html',
  styleUrl: './s-divider.component.scss'
})
export class SDividerComponent {
  // The divider height
  @Input() height = '1px';

  // The divider color
  @Input() color = '#666';

  // Constructor for SDividerComponent component
  constructor() {}
}
