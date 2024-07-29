import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { StandardGraphService } from '../../services/standard_graph.service';

@Component({
  selector: 'app-input-dataset',
  templateUrl: './input-dataset.component.html',
  styleUrl: './input-dataset.component.scss'
})
export class InputDatasetComponent implements OnInit {

  // Dataset name event emitter
  @Output() datasetNameChange = new EventEmitter<string>();

  // The form
  public datasetForm!: FormGroup;

  // Loading status
  public loading: boolean = false;

  /**
   * Constructor for InputDatasetComponent component
   * @param formBuilder the FormBuilder
   * @param graphService the StandardGraphService service
   */
  constructor(
    private formBuilder: FormBuilder,
    private graphService: StandardGraphService) { }

  // NgOnInit implementation
  public ngOnInit(): void {
    this.datasetForm = this.formBuilder.group({
      datasetName: ['', [Validators.required, Validators.minLength(3)]]
    });
  }

  // Check dataset name and emit it
  public checkDatasetName(): void {
    if (this.datasetForm.valid) {
      this.loading = true;

      const datasetName = this.datasetForm.get('datasetName')!.value;
      if (datasetName != '') {
        this.graphService.checkUniqueDataset(datasetName).subscribe({
          next: response => {
            if (response.http_status_code === 202) {
              this.loading = false;
              this.datasetNameChange.emit(datasetName);
            } else {
              this.loading = false;
              this.datasetForm.get('datasetName')!.setErrors({ nameExists: true });
            }
          },
          error: error => {
            const response = error.error || {};
            if (response.http_status_code === 404 || response.message === 'Dataset with this name already exist') {
              this.datasetForm.get('datasetName')!.setErrors({ nameExists: true });
            }
            this.loading = false;
          }, complete: () => { this.loading = false; }
        });
      }
    }
  }
}
