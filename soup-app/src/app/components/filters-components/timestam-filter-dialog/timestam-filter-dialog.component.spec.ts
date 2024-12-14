import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimestamFilterDialogComponent } from './timestam-filter-dialog.component';

describe('TimestamFilterDialogComponent', () => {
  let component: TimestamFilterDialogComponent;
  let fixture: ComponentFixture<TimestamFilterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimestamFilterDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimestamFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
