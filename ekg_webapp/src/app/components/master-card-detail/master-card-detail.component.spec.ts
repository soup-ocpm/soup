import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MasterCardDetailComponent } from './master-card-detail.component';

describe('MasterCardDetailComponent', () => {
  let component: MasterCardDetailComponent;
  let fixture: ComponentFixture<MasterCardDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MasterCardDetailComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MasterCardDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
