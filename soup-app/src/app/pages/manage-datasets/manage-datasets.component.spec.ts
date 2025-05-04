import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageDatasetsComponent } from './manage-datasets.component';

describe('ManageDatasetsComponent', () => {
  let component: ManageDatasetsComponent;
  let fixture: ComponentFixture<ManageDatasetsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageDatasetsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageDatasetsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
