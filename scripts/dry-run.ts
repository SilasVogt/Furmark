import { parseRunSelection, printRunSummary } from "../src/bench/cli";
import { runBenchmark } from "../src/bench/runner";

const selection = parseRunSelection(process.argv.slice(2));
const runs = await runBenchmark({ matrix: "full", ...selection, dryRun: true, installDependencies: false });
printRunSummary(runs);

