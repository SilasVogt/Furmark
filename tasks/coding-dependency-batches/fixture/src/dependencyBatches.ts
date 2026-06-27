export type DependencyGraph = Record<string, readonly string[]>;

export class DependencyCycleError extends Error {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Dependency cycle detected: ${cycle.join(", ")}`);
    this.name = "DependencyCycleError";
    this.cycle = cycle;
  }
}

export function dependencyBatches(graph: DependencyGraph): string[][] {
  const nodes = new Set<string>();
  for (const [node, dependencies] of Object.entries(graph)) {
    nodes.add(node);
    for (const dependency of dependencies) nodes.add(dependency);
  }

  const remainingDeps = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  for (const node of [...nodes].sort()) {
    const deps = new Set(graph[node] ?? []);
    remainingDeps.set(node, deps);
    for (const dependency of deps) {
      if (!dependents.has(dependency)) dependents.set(dependency, new Set());
      dependents.get(dependency)!.add(node);
    }
  }

  const batches: string[][] = [];
  const processed = new Set<string>();
  let ready = [...remainingDeps.entries()]
    .filter(([, deps]) => deps.size === 0)
    .map(([node]) => node)
    .sort();

  while (ready.length > 0) {
    batches.push(ready);
    const nextReady = new Set<string>();
    for (const node of ready) {
      processed.add(node);
      for (const dependent of dependents.get(node) ?? []) {
        const deps = remainingDeps.get(dependent);
        deps?.delete(node);
        if (deps?.size === 0 && !processed.has(dependent)) nextReady.add(dependent);
      }
    }
    ready = [...nextReady].sort();
  }

  if (processed.size !== nodes.size) {
    const cycle = [...nodes].filter((node) => !processed.has(node)).sort();
    throw new DependencyCycleError(cycle);
  }

  return batches;
}

