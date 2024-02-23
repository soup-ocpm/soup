import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailCardsComponent } from './detail-cards.component';

describe('DetailCardsComponent', () => {
  let component: DetailCardsComponent;
  let fixture: ComponentFixture<DetailCardsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DetailCardsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailCardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
