import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetriveDatasetComponent } from './retrive-dataset.component';

describe('RetriveDatasetComponent', () => {
  let component: RetriveDatasetComponent;
  let fixture: ComponentFixture<RetriveDatasetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetriveDatasetComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(RetriveDatasetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
