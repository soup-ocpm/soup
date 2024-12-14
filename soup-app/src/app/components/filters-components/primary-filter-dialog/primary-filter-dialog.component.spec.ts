import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrimaryFilterDialogComponent } from './primary-filter-dialog.component';

describe('PrimaryFilterDialogComponent', () => {
  let component: PrimaryFilterDialogComponent;
  let fixture: ComponentFixture<PrimaryFilterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrimaryFilterDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PrimaryFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
