import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'highlightSearch'
})
export class HighlightSearchPipe implements PipeTransform {
    transform(value: any, searchText: string): any {

    }

    private escapeRegExp(text: string) {
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }
}