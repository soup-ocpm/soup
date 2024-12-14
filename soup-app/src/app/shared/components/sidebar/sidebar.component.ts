import { CommonModule } from '@angular/common';
import { Component, TemplateRef } from '@angular/core';
import { SidebarConfig, SidebarService } from './sidebar.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  // The sidebar configuration
  config: SidebarConfig | null = null;

  // The sidebar content template
  content: TemplateRef<any> | null = null;

  // If the sidebar is open
  public isOpen: boolean = false;

  /**
   * Constructor for SidebarComponent component
   * @param sidebarService the SidebarService service
   */
  constructor(private sidebarService: SidebarService) {}

  // NgOnInit implementation
  public ngOnInit() {
    this.sidebarService.isOpen$.subscribe((open) => (this.isOpen = open));
    this.sidebarService.config$.subscribe((config) => (this.config = config));
    this.sidebarService.content$.subscribe((content) => (this.content = content));
  }

  /**
   * Close the sidebar
   */
  public closeSidebar() {
    this.isOpen = false;
    setTimeout(() => this.sidebarService.close(), 300);
  }
}
