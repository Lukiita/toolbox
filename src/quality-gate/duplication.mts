// Code duplication, measured by jscpd.
//
// The metric earns its place because copy-paste is the natural shortcut of an
// agent that already has the similar snippet in context - and it is the kind
// of regression that sails through lint, typecheck and tests without lighting
// anything up.

/** The slice of `jscpd-report.json` that matters. */
export interface JscpdReport {
  statistics: {
    total: {
      clones: number;
      duplicatedLines: number;
      percentage: number;
    };
  };
}

export interface DuplicationStats {
  /** Duplicated-lines percentage, two decimal places. */
  percent: number;
  /** Number of cloned fragments. */
  fragments: number;
}

export function duplicationStats(report: JscpdReport): DuplicationStats {
  const total = report.statistics.total;
  return {
    // Two decimal places because the ratchet compares numbers: without
    // rounding, floating-point noise would fail a PR that touched no
    // duplication at all.
    percent: Math.round(total.percentage * 100) / 100,
    fragments: total.clones,
  };
}
