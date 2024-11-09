import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatasetTileComponent } from './dataset-tile.component';

describe('DatasetCardComponent', () => {
  let component: DatasetTileComponent;
  let fixture: ComponentFixture<DatasetTileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatasetTileComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DatasetTileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
