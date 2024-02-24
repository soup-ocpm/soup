export class Card {

    // The Card title
    title: string = '';

    // The Card description
    type: string = '';

    // The Card data number (number of node or edges)
    dataNumber: number = 0;

    /**
     * Initialize a new instance of Card
     * @param title the card title
     * @param type the card type
     * @param dataNumber the number of data
     */
    constructor(title: string, type: string, dataNumber: number) {
        this.title = title;
        this.type = type;
        this.dataNumber = dataNumber;
    }
}