import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SButtonTComponent } from './s-button-t.component';

describe('SButtonTComponent', () => {
  let component: SButtonTComponent;
  let fixture: ComponentFixture<SButtonTComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SButtonTComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SButtonTComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
