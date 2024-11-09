import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SProgressbarComponent } from './s-progressbar.component';

describe('SProgressbarComponent', () => {
  let component: SProgressbarComponent;
  let fixture: ComponentFixture<SProgressbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SProgressbarComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SProgressbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
