import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestFilterComponent } from './test-filter.component';

describe('TestFilterComponent', () => {
  let component: TestFilterComponent;
  let fixture: ComponentFixture<TestFilterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestFilterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TestFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
