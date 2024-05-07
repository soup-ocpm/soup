import {NgModule} from "@angular/core";

// Core components import
import {ToastComponent} from "./components/toast/toast.component";
import {CommonModule} from "@angular/common";

@NgModule({
  declarations: [
    ToastComponent
  ],
  imports: [
    CommonModule,
  ],
  exports: [
    ToastComponent
  ]
})
export class CoreModule {
}
