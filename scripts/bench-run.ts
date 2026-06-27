import { parseRunSelection, printRunSummary } from "../src/bench/cli";
import { runBenchmark } from "../src/bench/runner";

const selection = parseRunSelection(process.argv.slice(2));
const runs = await runBenchmark(selection);
printRunSummary(runs);

