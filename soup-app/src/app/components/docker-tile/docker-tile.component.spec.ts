import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DockerTileComponent } from './docker-tile.component';

describe('DockerTileComponent', () => {
  let component: DockerTileComponent;
  let fixture: ComponentFixture<DockerTileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DockerTileComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DockerTileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
