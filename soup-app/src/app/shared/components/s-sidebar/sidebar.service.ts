import { Injectable, TemplateRef } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SidebarSubject } from './sidebar-subject.model';
import { SidebarConfig } from './sidebar.interface';

@Injectable({
  providedIn: 'root'
})
export class SidebarService {
  // List of the Sidebars
  private sidebars = new Map<string, SidebarSubject>();

  /**
   * Observable of the open status
   * @returns a boolean Observable
   */
  public isOpen$(id: string): Observable<boolean> {
    return this.sidebars.get(id)?.isOpen.asObservable() ?? of(false);
  }

  /**
   * Observable of the configuration
   * @returns a sidebar configuration Observable
   */
  public config$(id: string): Observable<SidebarConfig> {
    return this.sidebars.get(id)?.behaviourConfig.asObservable() ?? of(null as any);
  }

  /**
   * Observable of the content
   * @return a template ref observale of null
   */
  public content$(id: string): Observable<TemplateRef<any> | null> {
    return this.sidebars.get(id)?.behaviourContent.asObservable() ?? of(null);
  }

  /**
   * Initialize a new Sidebar
   * @param id the id of the unique sidebar
   */
  public initSidebar(id: string): void {
    this.sidebars.set(id, new SidebarSubject());
  }

  /**
   * Open a new sidebar
   * @param config the sidebar configuration
   * @param content the sidebar content
   * @param id optional id for the sidebar
   * @returns the id of the sidebar
   */
  public open(config: SidebarConfig, content: TemplateRef<any> | null = null, id?: string): string {
    const sidebarId = id ?? this.generateUniqueId();

    if (!this.sidebars.has(sidebarId)) {
      this.initSidebar(sidebarId);
    }

    const sidebar = this.sidebars.get(sidebarId)!;
    sidebar.behaviourConfig.next(config);
    sidebar.behaviourContent.next(content);
    sidebar.isOpen.next(false);

    // Set timeout
    setTimeout(() => {
      sidebar.isOpen.next(true);
    }, 50);

    return sidebarId;
  }

  /**
   * Reopen an existing sidebar using its id
   * @param id the id of the Sidebar to reopen
   */
  public reOpen(id: string): void {
    const sidebar = this.sidebars.get(id);

    if (sidebar) {
      sidebar.isOpen.next(true);
    }
  }

  /**
   * Check if a specific sidebar is open
   * @param id the id of the Sidebar to check
   * @returns true if the sidebar is open, false otherwise
   */
  public isSidebarOpen(id: string): boolean {
    const sidebar = this.sidebars.get(id);

    return sidebar ? sidebar.isOpen.getValue() === true : false;
  }

  /**
   * Check if there is any sidebar open
   */
  public isAnySidebarOpen(): boolean {
    return Array.from(this.sidebars.values()).some((sidebar) => sidebar.isOpen?.getValue() === true);
  }

  /**
   * Update the configuration of a specific Sidebar
   * @param id the id of the Sidebar to update
   * @param partialConfig the partial configuration to apply
   */
  public updateConfig(id: string, partialConfig: Partial<SidebarConfig>): void {
    const sidebar = this.sidebars.get(id);

    if (sidebar) {
      const currentConfig = sidebar.behaviourConfig.getValue();
      sidebar.behaviourConfig.next({ ...currentConfig, ...partialConfig });
    }
  }

  /**
   * Close a specific sidebar
   * @param id the id of the Sidebar to close
   */
  public close(id: string): void {
    const sidebar = this.sidebars.get(id);

    if (sidebar) {
      sidebar.isOpen.next(false);
    }
  }

  /**
   * Generate a unique id for the sidebar
   */
  private generateUniqueId(): string {
    return `sidebar-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all sidebars and release resources.
   */
  public clearAllSidebars(): void {
    this.sidebars.forEach((sidebar) => {
      // Complete the stream
      sidebar.isOpen.complete();
      sidebar.behaviourContent.complete();
      sidebar.behaviourConfig.complete();
    });

    // Clear the map
    this.sidebars.clear();
  }
}
