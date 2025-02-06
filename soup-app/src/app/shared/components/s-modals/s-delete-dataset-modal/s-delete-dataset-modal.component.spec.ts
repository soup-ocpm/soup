import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeleteDatasetModalComponent } from './s-delete-dataset-modal.component';

describe('DeleteDatasetModalComponent', () => {
  let component: DeleteDatasetModalComponent;
  let fixture: ComponentFixture<DeleteDatasetModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeleteDatasetModalComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteDatasetModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
