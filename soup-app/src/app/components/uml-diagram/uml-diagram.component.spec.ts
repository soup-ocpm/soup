import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UmlDiagramComponent } from './uml-diagram.component';

describe('UmlDiagramComponent', () => {
  let component: UmlDiagramComponent;
  let fixture: ComponentFixture<UmlDiagramComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UmlDiagramComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(UmlDiagramComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
