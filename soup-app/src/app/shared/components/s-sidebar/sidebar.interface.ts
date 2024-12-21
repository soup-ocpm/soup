/**
 * The sidebar configuration interface
 * @version 1.0
 */
export interface SidebarConfig {
  // Sidebar width
  width: string;

  // Sidebar background color
  backgroundColor: string;

  // Sidebar title
  title: string;

  // If the sidebar have the close btn
  closeIcon: boolean;

  // Sidebar footer buttons
  footerButtons: { label: string; action: () => void; color: string }[];

  // Sticky the footer
  stickyFooter: boolean;
}
