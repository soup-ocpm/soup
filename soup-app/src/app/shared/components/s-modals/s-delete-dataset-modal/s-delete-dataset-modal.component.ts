import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, Input, Output } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';
import { ModalService } from '../modal.service';

@Component({
  selector: 'app-s-delete-dataset-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    // Components import
    SpBtnComponent
  ],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [style({ top: '-300px', opacity: 0 }), animate('0.3s ease-out', style({ top: '55px', opacity: 1 }))]),
      transition(':leave', [animate('0.3s ease-in', style({ top: '-300px', opacity: 0 }))])
    ])
  ],
  templateUrl: './s-delete-dataset-modal.component.html',
  styleUrl: './s-delete-dataset-modal.component.scss'
})
export class DeleteDatasetModalComponent {
  // The modal title
  @Input() title = '';

  // The modal message
  @Input() message = '';

  // The dataset name
  @Input() datasetName = '';

  // The principal button text
  @Input() primaryButtonText = '';

  // The principal button color
  @Input() primaryButtonColor = '';

  // The secondary button text
  @Input() secondaryButtonText = '';

  // The secondary button color
  @Input() secondaryButtonColor = '';

  // Handle the output
  @Output() primaryButtonClick!: (name: string) => Promise<any>;

  // Handle the second output
  @Output() secondaryButtonClick!: () => void | null;

  // The form
  public genericInputForm!: FormGroup;

  // The input value for the name
  public name = '';

  // If the modal is visible or not
  public isVisible = false;

  /**
   * Constructor for DeleteModalComponent component
   * @param formBuilder the FormBuilder
   * @param modalService the ModalService service
   */
  constructor(
    private formBuilder: FormBuilder,
    private modalService: ModalService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.genericInputForm = this.formBuilder.group({
      name: ['', Validators.required]
    });

    this.modalService.deleteDatasetModalState.subscribe((modal) => {
      if (modal) {
        this.title = modal.title;
        this.message = modal.message;
        this.datasetName = modal.datasetName;
        this.primaryButtonText = modal.primaryButtonText;
        this.primaryButtonColor = modal.primaryButtonColor;
        this.secondaryButtonText = modal.secondaryButtonText;
        this.secondaryButtonColor = modal.secondaryButtonColor;
        this.primaryButtonClick = modal.primaryButtonClick;
        this.secondaryButtonClick = modal.secondaryButtonClick;
        this.isVisible = true;
      }
    });
  }

  /**
   * Click to te primary button
   */
  public onClickPrimaryButton(): void {
    const nameSelected = this.name;

    if (typeof this.primaryButtonClick === 'function') {
      this.name = '';
      this.primaryButtonClick(nameSelected);
    }

    this.isVisible = false;
    this.genericInputForm.reset();
  }

  /**
   * Click to the secondary button
   */
  public onClickSecondaryButton(): void {
    if (typeof this.secondaryButtonClick === 'function') {
      this.name = '';
      this.secondaryButtonClick();
    }

    this.isVisible = false;
    this.genericInputForm.reset();
  }

  /**
   * If the input name and dataset name match
   */
  public nameMatched(): boolean {
    return this.name === this.datasetName;
  }
}
