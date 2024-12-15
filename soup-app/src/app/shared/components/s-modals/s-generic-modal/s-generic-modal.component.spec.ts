import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenericModalComponent } from './s-generic-modal.component';

describe('DeleteModalComponent', () => {
  let component: GenericModalComponent;
  let fixture: ComponentFixture<GenericModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenericModalComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(GenericModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
