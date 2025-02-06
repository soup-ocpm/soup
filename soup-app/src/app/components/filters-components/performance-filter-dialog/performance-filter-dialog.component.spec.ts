import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PerformanceFilterDialogComponent } from './performance-filter-dialog.component';

describe('PerformanceFilterDialogComponent', () => {
  let component: PerformanceFilterDialogComponent;
  let fixture: ComponentFixture<PerformanceFilterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PerformanceFilterDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PerformanceFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
