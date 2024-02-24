export class MasterCard {

    // The Card title
    title: string = '';

    // The Card description
    description: string = '';

    // The Card json data
    jsonData: any = null;

    /**
     * Initialize a new instance of MasterCard
     * @param title the card title
     * @param description the card description
     * @param jsonData the json data
     */
    constructor(title: string, description: string, jsonData: any) {
        this.title = title;
        this.description = description;
        this.jsonData = jsonData;
    }
}