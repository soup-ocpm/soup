import { KeyValuePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { ApiResponse } from '../../../core/models/api_response.model';
import { PackageLoaderService } from '../../../core/v3/package-loader.service';
import { PackageInfo } from '../../../core/v3/v3.models';
import { V3ApiService } from '../../../core/v3/v3-api.service';
import { NotificationService } from '../../../shared/components/s-toast/toast.service';
import { errorMessage, notify } from '../../components/notify';

// A change that needs a confirmation first
interface PendingChange {
  kind: 'disable-cascade' | 'uninstall';
  pkg: PackageInfo;
  dependents: string[];
}

/**
 * /packages - the installed packages with status, version, contributions
 * and errors (of the server and of the frontend bundle); install from a
 * zip, enable, disable (with the dependents, after a confirmation) and
 * uninstall. After every change the list is read again and the frontend
 * modules are reloaded, without reloading the page.
 */
@Component({
  selector: 'app-packages',
  imports: [KeyValuePipe],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class PackagesComponent implements OnInit {
  public readonly packages = signal<PackageInfo[]>([]);
  public readonly loadError = signal('');
  public readonly busy = signal('');

  public readonly archive = signal<File | null>(null);
  public readonly allowOverride = signal(false);
  public readonly installError = signal('');

  public readonly pending = signal<PendingChange | null>(null);

  /**
   * Constructor for PackagesComponent component
   * @param api the V3ApiService service
   * @param loader the PackageLoaderService service (frontend state, reload)
   * @param notifications the NotificationService service
   */
  constructor(
    private api: V3ApiService,
    public loader: PackageLoaderService,
    private notifications: NotificationService
  ) {}

  public ngOnInit(): void {
    void this.refresh();
  }

  public async refresh(): Promise<void> {
    try {
      this.packages.set(await firstValueFrom(this.api.packages()));
      this.loadError.set('');
    } catch (error) {
      this.loadError.set(errorMessage(error));
    }
  }

  public contributionCount(pkg: PackageInfo): number {
    return Object.values(pkg.contributions).reduce((total, keys) => total + keys.length, 0);
  }

  // --- install ------------------------------------------------------------- //
  public onArchive(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archive.set(input.files?.[0] ?? null);
    this.installError.set('');
  }

  public onAllowOverride(event: Event): void {
    this.allowOverride.set((event.target as HTMLInputElement).checked);
  }

  public async install(): Promise<void> {
    const archive = this.archive();
    if (!archive) {
      return;
    }
    this.installError.set('');
    const installed = await this.change(`Installing ${archive.name}...`, this.api.installPackage(archive, this.allowOverride()), (error) =>
      this.installError.set(errorMessage(error))
    );
    if (installed) {
      this.archive.set(null);
      notify(this.notifications, `Package '${installed.name}' ${installed.version} installed`, 'success');
    }
  }

  // --- enable / disable / uninstall ---------------------------------------- //
  public async enable(pkg: PackageInfo): Promise<void> {
    if (await this.change(`Enabling ${pkg.name}...`, this.api.enablePackage(pkg.name))) {
      notify(this.notifications, `Package '${pkg.name}' enabled`, 'success');
    }
  }

  public async disable(pkg: PackageInfo, cascade = false): Promise<void> {
    this.pending.set(null);
    const disabled = await this.change(`Disabling ${pkg.name}...`, this.api.disablePackage(pkg.name, cascade), (error) => {
      const dependents = (error as ApiResponse<{ dependents?: string[] }>)?.responseData?.dependents ?? [];
      if ((error as ApiResponse)?.statusCode === 409 && dependents.length) {
        this.pending.set({ kind: 'disable-cascade', pkg, dependents });
      } else {
        notify(this.notifications, errorMessage(error), 'error');
      }
    });
    if (disabled) {
      notify(this.notifications, `Disabled: ${disabled.join(', ')}`, 'success');
    }
  }

  public askUninstall(pkg: PackageInfo): void {
    this.pending.set({ kind: 'uninstall', pkg, dependents: pkg.dependents });
  }

  public async uninstall(pkg: PackageInfo): Promise<void> {
    this.pending.set(null);
    if (await this.change(`Uninstalling ${pkg.name}...`, this.api.uninstallPackage(pkg.name))) {
      notify(this.notifications, `Package '${pkg.name}' uninstalled`, 'success');
    }
  }

  public cancelPending(): void {
    this.pending.set(null);
  }

  /**
   * Run a change, then read the list again and reload the frontend modules.
   * @returns the answer, or null if the change failed (`onError`, else a notification)
   */
  private async change<T>(message: string, request: Observable<T>, onError?: (error: unknown) => void): Promise<T | null> {
    this.busy.set(message);
    let result: T | null = null;
    try {
      result = await firstValueFrom(request);
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        notify(this.notifications, errorMessage(error), 'error');
      }
    }
    await Promise.all([this.refresh(), this.loader.reload()]);
    this.busy.set('');
    return result;
  }
}
