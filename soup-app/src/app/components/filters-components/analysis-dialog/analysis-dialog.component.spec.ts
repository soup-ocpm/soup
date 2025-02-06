import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalysisDialogComponent } from './analysis-dialog.component';

describe('AnalysisDialogComponent', () => {
  let component: AnalysisDialogComponent;
  let fixture: ComponentFixture<AnalysisDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalysisDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AnalysisDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
