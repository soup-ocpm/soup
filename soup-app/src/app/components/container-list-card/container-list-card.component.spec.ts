import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContainerListCardComponent } from './container-list-card.component';

describe('ContainerListCardComponent', () => {
  let component: ContainerListCardComponent;
  let fixture: ComponentFixture<ContainerListCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContainerListCardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ContainerListCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
