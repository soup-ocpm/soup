import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SSpinnerOneComponent } from './s-spinner-one.component';

describe('SSpinnerOneComponent', () => {
  let component: SSpinnerOneComponent;
  let fixture: ComponentFixture<SSpinnerOneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SSpinnerOneComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SSpinnerOneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
