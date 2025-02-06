import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VariationFilterDialogComponent } from './variation-filter-dialog.component';

describe('VariationFilterDialogComponent', () => {
  let component: VariationFilterDialogComponent;
  let fixture: ComponentFixture<VariationFilterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VariationFilterDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(VariationFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
