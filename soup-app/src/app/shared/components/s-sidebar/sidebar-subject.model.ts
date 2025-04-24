import { TemplateRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { SidebarConfig } from './sidebar.interface';

/**
 * The sidebar subject configuration
 * @version 1.0
 * @since 2.0.0
 * @author Alessio Giacché
 */
export class SidebarSubject {
  // Is open flag
  public isOpen: BehaviorSubject<boolean>;

  // The content
  public behaviourContent: BehaviorSubject<TemplateRef<any> | null>;

  // The configuration
  public behaviourConfig: BehaviorSubject<SidebarConfig>;

  /**
   * Initialize a new instance of SidebarSubject subject
   */
  public constructor() {
    this.isOpen = new BehaviorSubject<boolean>(false);
    this.behaviourContent = new BehaviorSubject<TemplateRef<any> | null>(null);
    this.behaviourConfig = new BehaviorSubject<SidebarConfig>({
      width: '250px',
      backgroundColor: '#f4f4f4',
      title: '',
      closeIcon: true,
      stickyFooter: true,
      footerButtons: []
    });
  }
}
