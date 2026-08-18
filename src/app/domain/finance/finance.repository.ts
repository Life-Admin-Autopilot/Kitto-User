import type { FinanceSummary, FinanceWindow } from './finance';

/**
 * The money port. One method, and no writes.
 *
 * There is deliberately nothing here that can change what a user owes. Every
 * figure the summary reports was stored by the document-scan pass or typed onto
 * a matter, so the amounts move when matters and scans do — and they are edited
 * through those surfaces, where the row's own context is on screen. A `setAmount`
 * on this port would be a second, contextless way to edit money.
 *
 * An abstract class rather than an interface plus a token, for the same reason
 * MatterRepository is one: the class is both the compile-time type and the
 * runtime DI token, so the binding in the composition root cannot drift from the
 * type the store consumes.
 */
export abstract class FinanceRepository {
  /**
   * The whole picture for the last `months` months.
   *
   * `months` is not optional. The window is a control the user can see and
   * change, and a defaulted parameter here would put the default in two places —
   * one of which nobody would remember to keep in step.
   */
  abstract summary(months: FinanceWindow, signal?: AbortSignal): Promise<FinanceSummary>;
}
