import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActivityFilterDialogComponent } from './activity-filter-dialog.component';

describe('ActivityFilterDialogComponent', () => {
  let component: ActivityFilterDialogComponent;
  let fixture: ComponentFixture<ActivityFilterDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityFilterDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityFilterDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
