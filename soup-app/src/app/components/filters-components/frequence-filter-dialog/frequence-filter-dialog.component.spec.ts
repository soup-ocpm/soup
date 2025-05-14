import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FrequenceFilterDialogComponent } from './frequence-filter-dialog.component';

describe('FrequenceFilterDialogComponent', () => {
  let component: FrequenceFilterDialogComponent;
  let fixture: ComponentFixture<FrequenceFilterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FrequenceFilterDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FrequenceFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
