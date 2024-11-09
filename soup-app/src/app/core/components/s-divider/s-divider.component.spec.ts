import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SDividerComponent } from './s-divider.component';

describe('SDividerComponent', () => {
  let component: SDividerComponent;
  let fixture: ComponentFixture<SDividerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SDividerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SDividerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
