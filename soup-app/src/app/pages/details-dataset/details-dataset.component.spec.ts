import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailsDatasetComponent } from './details-dataset.component';

describe('DetailsDatasetComponent', () => {
  let component: DetailsDatasetComponent;
  let fixture: ComponentFixture<DetailsDatasetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailsDatasetComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DetailsDatasetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
