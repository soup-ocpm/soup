import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VariantFilterDialogComponent } from './variant-filter-dialog.component';

describe('VariantFilterDialogComponent', () => {
  let component: VariantFilterDialogComponent;
  let fixture: ComponentFixture<VariantFilterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VariantFilterDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(VariantFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
