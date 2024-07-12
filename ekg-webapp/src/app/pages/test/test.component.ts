import {Component} from '@angular/core';
import {Container} from "../../core/models/container.model";

@Component({
  selector: 'app-test',
  templateUrl: './test.component.html',
  styleUrl: './test.component.scss'
})
export class TestComponent {
  public haveChoiceContainer: boolean = false;
  public haveChoiceDirectory: boolean = false;

  container: Container = new Container('ed9bff4dbe7193422e881f6caae50d69bf9f31a0cf26a1fd3c7711ea6fa5f445', 'memgraph', true, 'memgraph/memgraph-platform');

  public onContainerClicked(event: any) {
    console.log(event)
  }
}
