import { SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component, Input, input, output } from '@angular/core';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';

/**
 * Side operation Component
 * @version 1.0.0
 * @since 2.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-side-operation',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    // Component import
    SpSpinnerComponent
  ],
  templateUrl: './side-operation.component.html',
  styleUrl: './side-operation.component.scss'
})
export class SideOperationComponent {
  // The operation title
  public title = input<string>();

  // The operation description
  public description = input<string>();

  // The operation icon
  public icon = input<string>();

  // If we want to add the loading status
  public loading = input<boolean>();

  // The operation action
  @Input() action: () => void = () => {};

  // @Output for emitting the click event
  public operationSelected = output<void>();

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
