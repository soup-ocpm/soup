import { CommonModule } from '@angular/common';
import { Component, TemplateRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { SpBtnComponent, SpDividerComponent, SpSpinnerComponent } from '@aledevsharp/sp-lib';
import { ActivityFilterDialogComponent } from '../../components/filters-components/activity-filter-dialog/activity-filter-dialog.component';
import { FrequenceFilterDialogComponent } from '../../components/filters-components/frequence-filter-dialog/frequence-filter-dialog.component';
import { PerformanceFilterDialogComponent } from '../../components/filters-components/performance-filter-dialog/performance-filter-dialog.component';
import { PrimaryFilterDialogComponent } from '../../components/filters-components/primary-filter-dialog/primary-filter-dialog.component';
import { TimestamFilterDialogComponent } from '../../components/filters-components/timestam-filter-dialog/timestam-filter-dialog.component';
import { VariationFilterDialogComponent } from '../../components/filters-components/variation-filter-dialog/variation-filter-dialog.component';
import { SidebarService } from '../../shared/components/sidebar/sidebar.service';
import { MaterialModule } from '../../shared/modules/materlal.module';
@Component({
  selector: 'app-test-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    NgbModule,
    // Component import
    SpBtnComponent,
    SpDividerComponent,
    SpSpinnerComponent
  ],
  templateUrl: './test-filter.component.html',
  styleUrl: './test-filter.component.scss'
})
export class TestFilterComponent {
  public isOpenFilterSidebar = false;
  public isLoading = false;

  // Lista dei filtri disponibili
  public filters = ['Timestamp', 'Performance', 'Include Activities', 'Exclude Activities', 'Frequence', 'Variation'];

  tiles: any[] = [];

  constructor(
    private modalService: NgbModal,
    private sidebarService: SidebarService
  ) {}

  addTile() {
    // Apri la modale principale per la selezione del filtro
    const modalRef = this.modalService.open(PrimaryFilterDialogComponent);
    modalRef.result
      .then((selectedFilter) => {
        if (selectedFilter) {
          this.openFilterDialog(selectedFilter);
        }
      })
      .catch((error) => console.error('Modal error:', error));
  }

  openFilterDialog(filter: string) {
    let filterModal;

    // In base al filtro selezionato, apri una modale specifica
    switch (filter) {
      case 'Timestamp':
        filterModal = this.modalService.open(TimestamFilterDialogComponent);
        break;

      case 'Performance':
        filterModal = this.modalService.open(PerformanceFilterDialogComponent);
        break;

      case 'Include Activities':
        filterModal = this.modalService.open(ActivityFilterDialogComponent);
        break;

      case 'Exclude Activities':
        filterModal = this.modalService.open(ActivityFilterDialogComponent);
        break;

      case 'Frequence':
        filterModal = this.modalService.open(FrequenceFilterDialogComponent);
        break;

      case 'Variation':
        filterModal = this.modalService.open(VariationFilterDialogComponent);
        break;

      default:
        console.error('Filtro non riconosciuto:', filter);
        return;
    }

    filterModal.result
      .then((result) => {
        if (result) {
          // Aggiungi la nuova tile con il risultato del filtro
          this.tiles.push({ type: filter, details: result });
        }
      })
      .catch((error) => console.error('Modal error:', error));
  }

  openSidebar(content: TemplateRef<any>) {
    this.sidebarService.open(
      {
        width: '500px',
        backgroundColor: '#fff',
        title: 'Sidebar Dinamica',
        footerButtons: [
          { label: 'Save', action: () => this.confirmAction(), color: '#28a745' },
          { label: 'Cancel', action: () => this.sidebarService.close(), color: '#dc3545' }
        ]
      },
      content
    );
  }

  confirmAction() {
    console.log('Azione confermata!');
    this.sidebarService.close();
  }
}
