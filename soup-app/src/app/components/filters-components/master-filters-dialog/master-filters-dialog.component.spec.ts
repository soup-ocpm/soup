import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MasterFiltersDialogComponent } from './master-filters-dialog.component';

describe('PrimaryFilterDialogComponent', () => {
  let component: MasterFiltersDialogComponent;
  let fixture: ComponentFixture<MasterFiltersDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasterFiltersDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(MasterFiltersDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
