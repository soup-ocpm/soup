import {NgModule} from "@angular/core";
import {AppRoutingModule} from "../app-routing.module";
import {NgOptimizedImage} from "@angular/common";

// Shared components import
import {NavbarComponent} from "./navbar/navbar.component";
import {FooterComponent} from "./footer/footer.component";

@NgModule({
  declarations: [
    NavbarComponent,
    FooterComponent
  ],
  imports: [
    AppRoutingModule,
    NgOptimizedImage,
  ],
  exports: [
    NavbarComponent,
    FooterComponent
  ]
})
export class SharedModule {
}
