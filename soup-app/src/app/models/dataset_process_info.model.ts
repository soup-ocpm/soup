/**
 * Dataset process information model class
 * @version 1.0
 * @since 1.0.0
 * @author Alessio Giacché
 */
export class DatasetProcessInfo {
  // Start execution process time for standard graph
  public startNormalExecutionTime: any;

  // Stop execution process time for standard graph
  public finishNormalExecutionTime: any;

  // Start execution process time for class graph
  public startClassExecutionTime: any;

  // Stop execution process time for class graph
  public finishClassExecutionTime: any;

  // Start execution process time for event nodes
  public startEventTimeExecution: any;

  // Stop execution process time for event nodes
  public finishEventTimeExecution: any;

  // Start execution process time for entity nodes
  public startEntityTimeExecution: any;

  // Stop execution process time for entity nodes
  public finishEnityTimeExecution: any;

  // Start execution process time for CORR relationships
  public startCorrTimeExecution: any;

  // Stop execution process time for CORR relationships
  public finishCorrTimeExecution: any;

  // Start execution process time for DF relationships
  public startDfTimeExecution: any;

  // Stop execution process time for DF relationships
  public finishDfTimeExecution: any;

  // Start execution process time for class nodes
  public startClassNodeTimeExecution: any;

  // Stop execution process time for class nodes
  public finishClassNodeTimeExecution: any;

  // Start execution process time for OBS relationships
  public startObsTimeExecution: any;

  // Stop execution process time for OBS relationships
  public finishObsTimeExecution: any;

  // Start execution process time for DF_C relationships
  public startDfCTimeExecution: any;

  // Stop execution process time for DF_C relationships
  public finishDfCTimeExecution: any;

  // Normal duration time
  public durationNormalExecution: number | undefined;

  // Class duration time
  public durationClassExecution: number | undefined;

  // Event duration time
  public durationEventExecution: number | undefined;

  // Entity duration time
  public durationEntityExecution: number | undefined;

  // :CORR duration time
  public durationCorrExecution: number | undefined;

  // :DF duration time
  public durationDfExecution: number | undefined;

  // Class nodes duration time
  public durationClassNodeExecution: number | undefined;

  // :OBS duration time
  public durationObsExecution: number | undefined;

  // :DF_C duration time
  public durationDfCExecution: number | undefined;
}
