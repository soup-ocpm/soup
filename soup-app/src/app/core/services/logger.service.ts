import { Injectable } from '@angular/core';

import { LogLevel } from '../enums/logger.enum';

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  // The current log level
  private logLevel: LogLevel = LogLevel.Debug;

  /**
   * Initialize a new instance of LoggerService service
   */
  constructor() {}

  /**
   * Log only informations
   * @param message the message
   * @param optionalParams the optional parameters
   */
  public info(message: string, ...optionalParams: any[]) {
    if (this.logLevel <= LogLevel.Info) {
      console.info(`INFO: ${message}`, ...optionalParams);
    }
  }

  /**
   * Log only warnings
   * @param message the message
   * @param optionalParams the optional parameters
   */
  public warn(message: string, ...optionalParams: any[]) {
    if (this.logLevel <= LogLevel.Warn) {
      console.warn(`WARN: ${message}`, ...optionalParams);
    }
  }

  /**
   * Log only errors
   * @param message the message
   * @param optionalParams the optional parameters
   */
  public error(message: string, ...optionalParams: any[]) {
    if (this.logLevel <= LogLevel.Error) {
      console.error(`ERROR: ${message}`, ...optionalParams);
    }
  }

  /**
   * Log only debug message
   * @param message the message
   * @param optionalParams the optional parameters
   */
  public debug(message: string, ...optionalParams: any[]) {
    if (this.logLevel <= LogLevel.Debug) {
      console.debug(`DEBUG: ${message}`, ...optionalParams);
    }
  }
}
