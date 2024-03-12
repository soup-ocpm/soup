import {Injectable} from "@angular/core";

@Injectable({
  providedIn: 'root',
})
export class SupportDataService {

  // If the User skip the graph creation and retrieved information
  public haveRetrievedInformation: boolean = false;

  // If the User has viewed the Graph
  public hasShowClassGraph: boolean = false;

  // Column filtered by the User
  public filteredColumn: string[] = [];

  // Get fitered column
  public getFilteredColumn(): string[] {
    return this.filteredColumn;
  }

  // Set new list for filtered column
  public setFilteredColumn(filteredColumn: string[]): void {
    this.filteredColumn = filteredColumn;
  }

  // Get 'haveRetrievedInformation'
  public getHaveRetrievedInformation(): boolean {
    return this.haveRetrievedInformation;
  }

  // Set 'haveRetrievedInformation'
  public setHaveRetrievedInformation(retrieveInformation: boolean): void {
    this.haveRetrievedInformation = retrieveInformation;
  }

  // Set 'hasShowClassGraph'
  public updateShowGraph(show: boolean): void {
    this.hasShowClassGraph = show;
  }
}
