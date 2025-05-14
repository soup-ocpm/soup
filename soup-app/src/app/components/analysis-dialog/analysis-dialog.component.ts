import { SpBtnTxtComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Analysis } from 'src/app/models/analysis.mdel';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';

/**
 * Analysis Filter Component
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 'app-analysis-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    // Component import
    SpBtnTxtComponent
  ],
  templateUrl: './analysis-dialog.component.html',
  styleUrl: './analysis-dialog.component.scss'
})
export class AnalysisDialogComponent {
  /**
   * Constructor for AnalysisDialogComponent component
   * @param analysis the Analysis object
   */
  constructor(@Inject(MAT_DIALOG_DATA) public analysis: Analysis) {}

  /**
   * Download the json
   */
  public downloadJSON(): void {
    const payload = this.analysis.getJSONFormat();
    const jsonString = JSON.stringify(payload, null, 2);

    // Create the blob
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);

    // Create the link
    const link = document.createElement('a');
    link.href = url;
    link.download = this.analysis.analysisName + '.json';

    link.click();
    window.URL.revokeObjectURL(url);
  }
}
