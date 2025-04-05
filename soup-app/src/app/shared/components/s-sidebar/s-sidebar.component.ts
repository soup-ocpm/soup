import { SpBtnComponent } from '@aledevsharp/sp-lib';
import { CommonModule } from '@angular/common';
import { Component, input, OnInit, TemplateRef } from '@angular/core';

import { SidebarConfig } from './sidebar.interface';
import { SidebarService } from './sidebar.service';

/**
 * Sidebars component
 * @version 1.0
 * @since 2.0.0
 * @author Alessio Giacché
 */
@Component({
  selector: 's-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    // Component import
    SpBtnComponent
  ],
  templateUrl: './s-sidebar.component.html',
  styleUrl: './s-sidebar.component.scss'
})
export class SidebarComponent implements OnInit {
  // The sidebar configuration
  public config: SidebarConfig | null = null;

  // The sidebar content template
  public content: TemplateRef<any> | null = null;

  // If the sidebar is open
  public isOpen = false;

  // The sidebar id
  public sidebarId = input.required<string>();

  /**
   * Constructor for SidebarComponent component
   * @param sidebarService the SidebarService service
   */
  constructor(private sidebarService: SidebarService) {}

  // NgOnInit implementation
  public ngOnInit(): void {
    this.sidebarService.isOpen$(this.sidebarId()).subscribe((open) => {
      this.isOpen = open;
    });

    this.sidebarService.config$(this.sidebarId()).subscribe((config) => {
      this.config = config;
    });

    this.sidebarService.content$(this.sidebarId()).subscribe((content) => {
      this.content = content;
    });
  }

  /**
   * Close the sidebar
   */
  public closeSidebar() {
    this.isOpen = false;
    setTimeout(() => this.sidebarService.close(this.sidebarId()), 300);
  }
}
