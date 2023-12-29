import { Component, OnInit } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { GraphService } from "src/app/services/graph.service";
import { MatCardModule } from '@angular/material/card';
import { MatStepperModule } from "@angular/material/stepper";


@Component({
    selector: 'dialog-help-class',
    templateUrl: 'dialog-help-class.component.html',
    styleUrls: ['./dialog-help-class.component.scss'],
    standalone: true,
    imports: [
        MatDialogModule,
        MatButtonModule,
        MatCardModule,
        MatStepperModule
    ],
})
export class DialogHelpClassComponent implements OnInit {

    public isTutorialTerminated: boolean | undefined;


    /**
     * Constructor for DialogElementComponent
     * @param graphService the service for the Graph.
     * @param router the Router.
     */
    constructor(
        private snackBar: MatSnackBar,
        private graphService: GraphService,
        private router: Router,
    ) { }


    //NgOnInit implementation
    ngOnInit(): void {
        this.isTutorialTerminated = false;
    }
}
