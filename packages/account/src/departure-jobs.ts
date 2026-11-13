export type DepartureBatchResult = { completed: number; failed: number; discarded: number };
export class AccountDepartureBatchError extends Error {
  constructor(readonly result: DepartureBatchResult) {
    super("Account departure batch incomplete");
    this.name = "AccountDepartureBatchError";
  }
}

/** Domain composition supplies both callbacks. Confirmed work has priority;
 * assessment failures must never be reported as a successful job run. */
export async function runAccountDepartureBatch(input: {
  close: () => Promise<DepartureBatchResult>;
  assess: () => Promise<DepartureBatchResult>;
}) {
  const closures = await input.close();
  const assessments = await input.assess();
  const result = {
    completed: closures.completed + assessments.completed,
    failed: closures.failed + assessments.failed,
    discarded: closures.discarded + assessments.discarded,
    closuresCompleted: closures.completed,
    assessmentsCompleted: assessments.completed,
  };
  if (result.failed) throw new AccountDepartureBatchError(result);
  return result;
}
