import { Injectable } from '@angular/core';


@Injectable({
    providedIn: 'root',
})
export class GraphDataService {

    // Column filtered by the User
    public filteredColumn: string[] | undefined;

    // Get fitered column
    public getFilteredColumn(): string[] | undefined {
        return this.filteredColumn;
    }

    // Set new list for filtered column
    public setFilteredColumn(filteredColumn: string[]): void {
        this.filteredColumn = filteredColumn;
    }

    // Reset the filtered column
    public resetFilteredColumn(): void {
        this.filteredColumn = [];
    }
}