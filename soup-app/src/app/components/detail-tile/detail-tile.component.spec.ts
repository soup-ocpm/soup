import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailTileComponent } from './detail-tile.component';

describe('DetailTileComponent', () => {
  let component: DetailTileComponent;
  let fixture: ComponentFixture<DetailTileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailTileComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DetailTileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
