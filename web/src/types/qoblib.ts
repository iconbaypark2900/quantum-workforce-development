/** QOBLIB benchmark TypeScript types. */

export type QoblibSolverId =
  | "classical"
  | "heuristic"
  | "qaoa_sim"
  | "ibm_quantum"
  | "auto"
  | "hybrid_router";

export interface QoblibInstanceMeta {
  instance_id: string;
  description: string;
  n_assets: number;
  n_periods: number;
  path?: string;
}

export interface QoblibSolverMeta {
  id: QoblibSolverId;
  label: string;
  available: boolean;
  requires_ibm: boolean;
}

export interface QuboEncodingResult {
  n_qubits: number;
  n_variables: number;
  encoding_type: string;
  penalty_lambda: number;
  bits_per_asset: number;
  qubo_density: number;
}

export interface QoblibSolverResult {
  run_id: string;
  instance_id: string;
  requested_backend: QoblibSolverId | string;
  actual_backend: string;
  solver_version: string;
  feasible: boolean;
  weights: number[];
  objective_value: number;
  expected_return: number;
  portfolio_volatility: number;
  sharpe_ratio: number;
  n_active_assets: number;
  wall_time_seconds: number;
  timestamp: string;
  metadata: Record<string, unknown>;
  qubo_encoding: QuboEncodingResult | null;
  error: string | null;
}

export interface QoblibRunRow {
  run_id: string;
  instance_id: string;
  requested_backend: string;
  actual_backend: string;
  feasible: string;
  objective_value: string;
  expected_return: string;
  portfolio_volatility: string;
  sharpe_ratio: string;
  n_active_assets: string;
  wall_time_seconds: string;
  timestamp: string;
}
