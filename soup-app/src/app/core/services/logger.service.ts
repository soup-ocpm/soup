import { Injectable } from '@angular/core';

import { LogLevel } from '../enums/logger.enum';

/**
 * Logger service
 * @version 1.0.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
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
      console.info(`[LOGGER-INFO]: ${message}`, ...optionalParams);
    }
  }

  /**
   * Log only warnings
   * @param message the message
   * @param optionalParams the optional parameters
   */
  public warn(message: string, ...optionalParams: any[]) {
    if (this.logLevel <= LogLevel.Warn) {
      console.warn(`[LOGGER-WARN]: ${message}`, ...optionalParams);
    }
  }

  /**
   * Log only errors
   * @param message the message
   * @param optionalParams the optional parameters
   */
  public error(message: string, ...optionalParams: any[]) {
    if (this.logLevel <= LogLevel.Error) {
      console.error(`[LOGGER-ERROR]: ${message}`, ...optionalParams);
    }
  }

  /**
   * Log only debug message
   * @param message the message
   * @param optionalParams the optional parameters
   */
  public debug(message: string, ...optionalParams: any[]) {
    if (this.logLevel <= LogLevel.Debug) {
      console.debug(`[LOGGER-DEBUG]: ${message}`, ...optionalParams);
    }
  }
}
