import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Dataset } from 'src/app/models/dataset.model';
import { Entity } from 'src/app/models/entity.mode';
import { MaterialModule } from 'src/app/shared/modules/materlal.module';
import { LocalDataService } from 'src/app/shared/services/support.service';

@Component({
  selector: 'app-activity-filter-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    // Component import
    SpBtnComponent
  ],
  templateUrl: './activity-filter-dialog.component.html',
  styleUrl: './activity-filter-dialog.component.scss'
})
export class ActivityFilterDialogComponent implements OnInit {
  // The input data from external
  public inputData: any;

  // All the .csv file entities
  public allFilteredValues: Entity[] = [];

  // The current dataset
  public currentDataset: Dataset | undefined;

  /**
   * Constructor for ActivityFilterDialogComponent component
   * @param activeModal the NgbActiveModal
   * @param supportDataService the LocalDataService service
   */
  constructor(
    public activeModal: NgbActiveModal,
    private supportDataService: LocalDataService
  ) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.currentDataset = this.supportDataService!.getCurrentDataset();
    const entityOne = new Entity();
    entityOne.name = 'Uno';
    entityOne.selected = false;

    const entityTwo = new Entity();
    entityTwo.name = 'Due';
    entityTwo.selected = false;

    const entityThree = new Entity();
    entityThree.name = 'Tre';
    entityThree.selected = false;

    const entityFour = new Entity();
    entityFour.name = 'Quattro';
    entityFour.selected = false;

    const entityFive = new Entity();
    entityFive.name = 'Cinque';
    entityFive.selected = false;

    const entitySix = new Entity();
    entitySix.name = 'Sei';
    entitySix.selected = false;

    const entitySeven = new Entity();
    entitySeven.name = 'Sette';
    entitySeven.selected = false;

    const entityEight = new Entity();
    entityEight.name = 'Otto';
    entityEight.selected = false;

    const entityNine = new Entity();
    entityNine.name = 'Nove';
    entityNine.selected = false;

    const entityTen = new Entity();
    entityTen.name = 'Dieci';
    entityTen.selected = false;

    // Aggiungi tutte le entità all'array
    this.allFilteredValues.push(
      entityOne,
      entityTwo,
      entityThree,
      entityFour,
      entityFive,
      entitySix,
      entitySeven,
      entityEight,
      entityNine,
      entityTen
    );
  }

  /**
   * Submit the selected entity
   * @param entity the selected entity
   * @param event the event (boolean value)
   */
  public submitEntity(entity: Entity, event: any): void {
    entity.selected = event;
    if (entity.selected) {
      this.allFilteredValues.forEach((e: Entity): void => {
        if (e.name == entity.name) {
          e.selected = entity.selected;
        }
      });
    }
  }

  /**
   * Submit the data
   */
  public onSubmit(): void {}

  /**
   * Close the modal without returning any data.
   */
  public onClose(): void {
    this.activeModal.dismiss();
  }

  /**
   * Get the current dataset filtered columns
   * @returns
   */
  public getFilteredValuesColumn(): string[] {
    return ['Ciao', 'Cazzo'];
  }
}
