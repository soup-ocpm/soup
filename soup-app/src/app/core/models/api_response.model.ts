/**
 * Api response model class
 * @version 1.0
 */
export class ApiResponse<T = any> {
  // The http status code
  statusCode: number;

  // The http response data
  responseData: T | null;

  // The http message
  message: string;

  /**
   * Initialize a new instance of ApiResponse model
   * @param statusCode the http status code
   * @param responseData the http response data
   * @param message the message
   */
  constructor(statusCode: number, responseData: T | null, message: string) {
    this.statusCode = statusCode;
    this.responseData = responseData;
    this.message = message;
  }
}
