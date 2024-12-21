import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SideOperationComponent } from './side-operation.component';

describe('SideOperationComponent', () => {
  let component: SideOperationComponent;
  let fixture: ComponentFixture<SideOperationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SideOperationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SideOperationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
