import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewDatasetComponent } from './new-dataset.component';

describe('NewDatasetComponent', () => {
  let component: NewDatasetComponent;
  let fixture: ComponentFixture<NewDatasetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewDatasetComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(NewDatasetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
