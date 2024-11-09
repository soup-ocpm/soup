import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DagreD3Component } from './dagre-d3.component';

describe('DagreD3Component', () => {
  let component: DagreD3Component;
  let fixture: ComponentFixture<DagreD3Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DagreD3Component]
    }).compileComponents();

    fixture = TestBed.createComponent(DagreD3Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
