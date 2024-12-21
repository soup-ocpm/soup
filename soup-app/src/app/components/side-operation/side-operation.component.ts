import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';

@Component({
  selector: 'app-side-operation',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './side-operation.component.html',
  styleUrl: './side-operation.component.scss'
})
export class SideOperationComponent {
  // The operation title
  @Input() title: string = '';

  // The operation description
  @Input() description: string = '';

  // The operation icon
  @Input() icon: string = '';

  // The operation action
  @Input() action: () => void = () => {};

  // @Output for emitting the click event
  @Output() operationSelected: EventEmitter<void> = new EventEmitter<void>();

  /**
   * Constructor for SideOperationComponent component
   */
  constructor() {}

  /**
   * Handle the event emitter
   */
  public onClick(): void {
    this.operationSelected.emit();
  }
}
