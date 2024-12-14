import { Injectable, TemplateRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Sidebar configuration interface
export interface SidebarConfig {
  width: string;
  backgroundColor: string;
  title: string;
  footerButtons: { label: string; action: () => void; color: string }[];
}

@Injectable({
  providedIn: 'root'
})
export class SidebarService {
  // Is open subject
  private isOpenSubject = new BehaviorSubject<boolean>(false);

  // Content subject
  private contentSubject = new BehaviorSubject<TemplateRef<any> | null>(null);

  // Configuration subject
  private configSubject = new BehaviorSubject<SidebarConfig>({
    width: '250px',
    backgroundColor: '#f4f4f4',
    title: '',
    footerButtons: []
  });

  // Is open observable
  public isOpen$ = this.isOpenSubject.asObservable();

  // Configuration observable
  public config$ = this.configSubject.asObservable();

  // Content observable
  public content$ = this.contentSubject.asObservable();

  /**
   * Open the sidebar
   * @param config the configuration
   * @param content the template ref
   */
  public open(config: SidebarConfig, content: TemplateRef<any> | null = null) {
    this.configSubject.next(config);
    this.contentSubject.next(content);
    this.isOpenSubject.next(true);
  }

  /**
   * Close the sidebar
   */
  public close() {
    this.isOpenSubject.next(false);
  }
}
