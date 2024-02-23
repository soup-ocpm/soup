import { Component } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import { GraphService } from "src/app/services/graph.service";


@Component({
    selector: 'dialog-delete-graph',
    templateUrl: 'dialog-delete-graph.component.html',
    styleUrls: ['./dialog-delete-graph.component.scss'],
    standalone: true,
    imports: [MatDialogModule, MatButtonModule],
})
export class DialogDeleteGraphComponent {

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

    /**
     * This method use the graph Service for 
     * delete graph. 
     */
    public deleteGraph() {
        let responseData: any;
        this.graphService.deleteStandardGraph().subscribe(
            (response) => {
                responseData = response;
                if (responseData.status == 200) {
                    this.openSnackBar('Graph deleted.', 'Done');
                    this.router.navigateByUrl('/welcome');
                }
            },
            (error) => {
                responseData = error;
                this.openSnackBar('Internal Server Error.', 'Retry');
            }
        )
    }

    /**
     * Open Snackbar with specific message and action (button)
     * @param message the message
     * @param action the action
    */
    openSnackBar(message: string, action: string) {
        this.snackBar.open(message, action);
    }

}