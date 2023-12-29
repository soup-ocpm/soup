import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConnectorPageComponent } from './connector-page.component';

describe('ConnectorPageComponent', () => {
  let component: ConnectorPageComponent;
  let fixture: ComponentFixture<ConnectorPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ConnectorPageComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConnectorPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
