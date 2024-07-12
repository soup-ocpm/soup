import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DockerTileDirectoryComponent } from './docker-tile-directory.component';

describe('DockerTileDirectoryComponent', () => {
  let component: DockerTileDirectoryComponent;
  let fixture: ComponentFixture<DockerTileDirectoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DockerTileDirectoryComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DockerTileDirectoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
