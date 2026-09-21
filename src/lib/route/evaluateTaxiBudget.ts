import type { ConstraintEvaluation } from "./evaluateConstraints";
import type {
  Conflict,
  SimulationResult,
  StructuredParameters,
  TaxiBudget,
  Violation,
} from "./types";

export interface EvaluateTaxiBudgetInput {
  readonly taxiBudget: TaxiBudget;
  readonly simulation: SimulationResult;
}

function assertNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

function createPassingEvaluation(): ConstraintEvaluation {
  const violations: readonly Violation[] = Object.freeze([]);
  const conflicts: readonly Conflict[] = Object.freeze([]);

  return Object.freeze({
    hardViolationCount: 0,
    violations,
    conflicts,
  });
}

export function evaluateTaxiBudget(
  input: EvaluateTaxiBudgetInput,
): ConstraintEvaluation {
  const taxiCost = input.simulation.totals.taxiCost;

  assertNonNegativeFiniteNumber(taxiCost, "simulation.totals.taxiCost");

  if (input.taxiBudget.type !== "capped") {
    return createPassingEvaluation();
  }

  const budgetAmount = input.taxiBudget.amount;

  assertNonNegativeFiniteNumber(budgetAmount, "taxiBudget.amount");

  if (taxiCost <= budgetAmount) {
    return createPassingEvaluation();
  }

  const propertyIds = Object.freeze([]);
  const parameters: StructuredParameters = Object.freeze({
    budgetAmount,
    taxiCost,
    exceededBy: taxiCost - budgetAmount,
    budgetType: "capped",
  });
  const violation: Violation = Object.freeze({
    kind: "violation",
    code: "taxi_budget_exceeded",
    severity: "error",
    propertyIds,
    parameters,
  });
  const conflict: Conflict = Object.freeze({
    kind: "conflict",
    code: "taxi_budget_exceeded",
    propertyIds,
    parameters,
  });
  const violations: readonly Violation[] = Object.freeze([violation]);
  const conflicts: readonly Conflict[] = Object.freeze([conflict]);

  return Object.freeze({
    hardViolationCount: 1,
    violations,
    conflicts,
  });
}
