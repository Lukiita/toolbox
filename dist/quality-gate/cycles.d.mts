/** file → internal files it imports. Only edges between known files enter. */
export declare function importGraph(sources: ReadonlyMap<string, string>, aliasPrefixes?: Readonly<Record<string, string>>): Map<string, string[]>;
/**
 * Strongly connected components with more than one member - the cycles.
 * Tarjan, recursion kept simple because production graphs here are hundreds
 * of nodes, not millions. Each cycle starts at its smallest member and walks
 * real edges, and the list is sorted, so reports and baselines are stable
 * across runs.
 */
export declare function circularDependencies(graph: ReadonlyMap<string, readonly string[]>): string[][];
