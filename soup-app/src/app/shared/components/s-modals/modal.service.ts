import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  // The generic modal subject
  private genericModalSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  // The generic modal observable
  public genericModalState: Observable<any> = this.genericModalSubject.asObservable();

  // The generic modal subject
  private deleteDatasetModalSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  // The generic modal observable
  public deleteDatasetModalState: Observable<any> = this.deleteDatasetModalSubject.asObservable();

  // The generic modal subject
  private inputModalSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  // The generic modal observable
  public inputModalState: Observable<any> = this.inputModalSubject.asObservable();

  // Initialize a new instance of NotificationService service
  constructor() {}

  /**
   * Show the Modal
   * @param title the title of the modal
   * @param message the message of the modal
   * @param doubleButton if modal has two buttons
   * @param primaryButtonText text of primary button
   * @param primaryButtonColor the color of primary button
   * @param secondaryButtonText text of secondary button
   * @param secondaryButtonColor the color of secondary button
   * @param primaryButtonClick function to execute when primary button is clicked
   * @param secondaryButtonClick function to execute when secondary button is clicked
   */
  public showGenericModal(
    title: string,
    message: string,
    doubleButton: boolean,
    primaryButtonText: string,
    primaryButtonColor: string,
    secondaryButtonText: string,
    secondaryButtonColor: string,
    primaryButtonClick: () => void,
    secondaryButtonClick: (() => void) | null
  ) {
    this.genericModalSubject.next({
      title,
      message,
      doubleButton,
      primaryButtonText,
      primaryButtonColor,
      secondaryButtonText,
      secondaryButtonColor,
      primaryButtonClick,
      secondaryButtonClick
    });
  }

  /**
   * Show the Modal
   * @param title the title of the modal
   * @param message the message of the modal
   * @param datasetName the dataset name
   * @param primaryButtonText text of primary button
   * @param primaryButtonColor the color of primary button
   * @param secondaryButtonText text of secondary button
   * @param secondaryButtonColor the color of secondary button
   * @param primaryButtonClick function to execute when primary button is clicked, it accepts inputValue from modal
   * @param secondaryButtonClick function to execute when secondary button is clicked
   */
  public showDeleteDatasetModal(
    title: string,
    message: string,
    datasetName: string,
    primaryButtonText: string,
    primaryButtonColor: string,
    secondaryButtonText: string,
    secondaryButtonColor: string,
    primaryButtonClick: (name: string) => Promise<any>,
    secondaryButtonClick: (() => void) | null
  ) {
    this.deleteDatasetModalSubject.next({
      title,
      message,
      datasetName,
      primaryButtonText,
      primaryButtonColor,
      secondaryButtonText,
      secondaryButtonColor,
      primaryButtonClick,
      secondaryButtonClick
    });
  }

  /**
   * Show the Modal
   * @param title the title of the modal
   * @param message the message of the modal
   * @param doubleButton if modal has two buttons
   * @param datasetName the name of the dataset if the modal is for analysis
   * @param isForDataset if the modal is for new dataset or not
   * @param primaryButtonText text of primary button
   * @param primaryButtonColor the color of primary button
   * @param secondaryButtonText text of secondary button
   * @param secondaryButtonColor the color of secondary button
   * @param primaryButtonClick function to execute when primary button is clicked, it accepts inputValue from modal
   * @param secondaryButtonClick function to execute when secondary button is clicked
   */
  public showInputModal(
    title: string,
    message: string,
    doubleButton: boolean,
    datasetName: string,
    isForDataset: boolean,
    primaryButtonText: string,
    primaryButtonColor: string,
    secondaryButtonText: string,
    secondaryButtonColor: string,
    primaryButtonClick: (datasetName: string, datasetDescription: string, saveProcessExecution: boolean) => Promise<any>,
    secondaryButtonClick: (() => void) | null
  ) {
    this.inputModalSubject.next({
      title,
      message,
      doubleButton,
      datasetName,
      isForDataset,
      primaryButtonText,
      primaryButtonColor,
      secondaryButtonText,
      secondaryButtonColor,
      primaryButtonClick,
      secondaryButtonClick
    });
  }

  /**
   * Hide the generic modal
   */
  public hideGenericModal() {
    this.genericModalSubject.next(null);
  }

  /**
   * Hide the modal for delete dataset
   */
  public hideDeleteDatasetModal(): void {
    this.deleteDatasetModalSubject.next(null);
  }

  /**
   * Hide the input modal
   */
  public hideInputModal() {
    this.inputModalSubject.next(null);
  }
}
