import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GraphDatasetComponent } from './graph-dataset.component';

describe('GraphDatasetComponent', () => {
  let component: GraphDatasetComponent;
  let fixture: ComponentFixture<GraphDatasetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraphDatasetComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GraphDatasetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
