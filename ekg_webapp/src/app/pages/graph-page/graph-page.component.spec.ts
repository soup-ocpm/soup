import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GraphPageComponent } from './graph-page.component';

describe('GraphPageComponent', () => {
  let component: GraphPageComponent;
  let fixture: ComponentFixture<GraphPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GraphPageComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GraphPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
