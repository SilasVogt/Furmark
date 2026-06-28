import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Boxes,
  Code2,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  Filter,
  GitCompare,
  Image,
  ListChecks,
  PanelRightOpen,
  RefreshCcw,
  Table2,
} from "lucide-react";
import type { ResultIndex, RunResult, TaskCategory, TaskSpec } from "../bench/schema";

type View = "matrix" | "tasks" | "compare" | "uplift";
type ArtifactKind = "final" | "metrics" | "diff" | "verification" | "stdout" | "stderr" | "events" | "screenshot";

const views: { id: View; label: string; icon: typeof Table2 }[] = [
  { id: "matrix", label: "Matrix", icon: Table2 },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "compare", label: "Side by side", icon: GitCompare },
  { id: "uplift", label: "Uplift", icon: BarChart3 },
];

const categoryLabels: Record<TaskCategory | "all", string> = {
  all: "All",
  "landing-page": "Landing",
  "browser-animation": "Animation",
  "pure-coding": "Coding",
};

const agentLabels: Record<string, string> = {
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  codex: "Codex",
};

const modeLabels: Record<string, string> = {
  baseline: "Baseline",
  ponytail: "Ponytail",
  furry: "Furry",
};

function appUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, "");
  const base = import.meta.env.BASE_URL;
  if (!base || base === "/") return `/${cleanPath}`;
  return `${base.endsWith("/") ? base : `${base}/`}${cleanPath}`;
}

export function App() {
  const [index, setIndex] = useState<ResultIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("matrix");
  const [category, setCategory] = useState<TaskCategory | "all">("all");
  const [batchId, setBatchId] = useState<string>("all");
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [artifact, setArtifact] = useState<{ run: RunResult; kind: ArtifactKind; url: string } | null>(null);

  useEffect(() => {
    void loadIndex().then(setIndex).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, []);

  const filteredRuns = useMemo(() => {
    const runs = index?.runs ?? [];
    return runs.filter((run) => {
      const categoryOk = category === "all" || run.category === category;
      const batchOk = batchId === "all" || run.batchId === batchId;
      return categoryOk && batchOk;
    });
  }, [batchId, category, index]);

  useEffect(() => {
    if (selectedRuns.length > 0 || filteredRuns.length === 0) return;
    setSelectedRuns(filteredRuns.slice(0, 3).map((run) => run.runId));
  }, [filteredRuns, selectedRuns.length]);

  if (error) {
    return (
      <Shell>
        <EmptyState title="Results unavailable" body={error} />
      </Shell>
    );
  }

  if (!index) {
    return (
      <Shell>
        <EmptyState title="Loading results" body="Reading public/results/index.json." />
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="topbar">
        <div>
          <p className="kicker">Furmark</p>
          <h1>Benchmark comparison</h1>
        </div>
        <div className="topbarActions">
          <IconButton label="Refresh" onClick={() => window.location.reload()} icon={RefreshCcw} />
          <IconButton label="JSON" onClick={() => downloadJson(index)} icon={FileJson} />
          <IconButton label="CSV" onClick={() => downloadCsv(filteredRuns)} icon={Download} />
        </div>
      </header>

      <section className="toolbar" aria-label="Viewer controls">
        <div className="segmented" role="tablist" aria-label="Views">
          {views.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              onClick={() => setView(item.id)}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <label className="selectLabel">
          <Filter size={15} />
          <select value={category} onChange={(event) => setCategory(event.target.value as TaskCategory | "all")}>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="selectLabel">
          <Boxes size={15} />
          <select value={batchId} onChange={(event) => setBatchId(event.target.value)}>
            <option value="all">All batches</option>
            {index.batches.map((batch) => (
              <option key={batch.batchId} value={batch.batchId}>
                {batch.batchId}
              </option>
            ))}
          </select>
        </label>
      </section>

      {view === "matrix" && <MatrixView runs={filteredRuns} />}
      {view === "tasks" && <TaskView runs={filteredRuns} tasks={index.tasks} />}
      {view === "compare" && (
        <CompareView
          runs={filteredRuns}
          selectedRuns={selectedRuns}
          onToggleRun={(runId) => setSelectedRuns((current) => toggleRun(current, runId))}
          onOpenArtifact={setArtifact}
        />
      )}
      {view === "uplift" && <UpliftView runs={filteredRuns} tasks={index.tasks} />}
      {artifact && <ArtifactDrawer artifact={artifact} onClose={() => setArtifact(null)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="appShell">{children}</main>;
}

function MatrixView({ runs }: { runs: RunResult[] }) {
  const agents = unique(runs.map((run) => run.agent));
  const modes = ["baseline", "ponytail", "furry"];
  return (
    <section className="panel" aria-labelledby="matrix-title">
      <div className="panelHeader">
        <h2 id="matrix-title">Model by mode</h2>
        <span>{runs.length} runs</span>
      </div>
      <div className="matrixGrid" role="table">
        <div className="matrixHead">Model</div>
        {modes.map((mode) => (
          <div className="matrixHead" key={mode}>
            {modeLabels[mode]}
          </div>
        ))}
        {agents.map((agent) => (
          <MatrixRow key={agent} agent={agent} runs={runs.filter((run) => run.agent === agent)} modes={modes} />
        ))}
      </div>
    </section>
  );
}

function MatrixRow({ agent, runs, modes }: { agent: string; runs: RunResult[]; modes: string[] }) {
  return (
    <>
      <div className="matrixModel">{agentLabels[agent] ?? agent}</div>
      {modes.map((mode) => {
        const group = runs.filter((run) => run.mode === mode);
        return (
          <div className="scoreCell" key={mode}>
            <strong>{average(group.map((run) => run.scores.total)).toFixed(1)}</strong>
            <span>
              {group.filter((run) => run.status === "passed").length} passed,{" "}
              {group.filter((run) => run.status === "skipped").length} skipped
            </span>
          </div>
        );
      })}
    </>
  );
}

function TaskView({ runs, tasks }: { runs: RunResult[]; tasks: TaskSpec[] }) {
  return (
    <section className="panel" aria-labelledby="task-title">
      <div className="panelHeader">
        <h2 id="task-title">Tasks and winners</h2>
        <span>{tasks.length} prompts</span>
      </div>
      <div className="taskList">
        {tasks.map((task) => {
          const taskRuns = runs.filter((run) => run.taskId === task.id);
          const winner = bestRun(taskRuns);
          return (
            <article className="taskRow" key={task.id}>
              <div>
                <h3>{task.title}</h3>
                <p>{task.topic}</p>
              </div>
              <div className="taskMeta">
                <span>{categoryLabels[task.category]}</span>
                <strong>{winner ? `${agentLabels[winner.agent]} ${modeLabels[winner.mode]}` : "No runs"}</strong>
                <span>{winner ? `${winner.scores.total.toFixed(1)} total` : "0.0 total"}</span>
                {winner?.artifacts.site ? (
                  <a className="openWinnerLink" href={appUrl(winner.artifacts.site)} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    Open winner
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CompareView({
  runs,
  selectedRuns,
  onToggleRun,
  onOpenArtifact,
}: {
  runs: RunResult[];
  selectedRuns: string[];
  onToggleRun: (runId: string) => void;
  onOpenArtifact: (artifact: { run: RunResult; kind: ArtifactKind; url: string }) => void;
}) {
  const selected = runs.filter((run) => selectedRuns.includes(run.runId)).slice(0, 3);
  return (
    <section className="compareLayout">
      <aside className="runPicker" aria-label="Run selector">
        <h2>Select runs</h2>
        {runs.map((run) => (
          <label key={run.runId} className="checkRow">
            <input
              type="checkbox"
              checked={selectedRuns.includes(run.runId)}
              onChange={() => onToggleRun(run.runId)}
              disabled={!selectedRuns.includes(run.runId) && selectedRuns.length >= 3}
            />
            <span>
              {agentLabels[run.agent]} {modeLabels[run.mode]}
              <small>{run.taskId}</small>
            </span>
          </label>
        ))}
      </aside>
      <div className="comparePanels">
        {selected.map((run) => (
          <RunPanel key={run.runId} run={run} onOpenArtifact={onOpenArtifact} />
        ))}
      </div>
    </section>
  );
}

function RunPanel({
  run,
  onOpenArtifact,
}: {
  run: RunResult;
  onOpenArtifact: (artifact: { run: RunResult; kind: ArtifactKind; url: string }) => void;
}) {
  const primaryScreenshot = run.artifacts.screenshots[0];
  const artifacts: { kind: ArtifactKind; label: string; icon: typeof Code2; url?: string }[] = [
    { kind: "final", label: "Final", icon: Eye, url: run.artifacts.final },
    { kind: "metrics", label: "Metrics", icon: BarChart3, url: run.artifacts.metrics },
    { kind: "diff", label: "Diff", icon: Code2, url: run.artifacts.diff },
    { kind: "verification", label: "Verify", icon: ListChecks, url: run.artifacts.verification },
    { kind: "stdout", label: "Stdout", icon: PanelRightOpen, url: run.artifacts.stdout },
    { kind: "stderr", label: "Stderr", icon: PanelRightOpen, url: run.artifacts.stderr },
    { kind: "events", label: "Events", icon: ListChecks, url: run.artifacts.events },
    { kind: "screenshot", label: "Shot", icon: Image, url: run.artifacts.screenshots[0] },
  ];
  return (
    <article className="runPanel">
      <header>
        <span className={`status ${run.status}`}>{run.status}</span>
        <h3>{agentLabels[run.agent]}</h3>
        <p>
          {modeLabels[run.mode]} · {run.taskId}
        </p>
      </header>
      <dl className="scoreStrip">
        <div>
          <dt>Total</dt>
          <dd>{run.scores.total.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Correct</dt>
          <dd>{run.scores.correctness.toFixed(0)}</dd>
        </div>
        <div>
          <dt>Style</dt>
          <dd>{run.scores.styleCompliance.toFixed(0)}</dd>
        </div>
      </dl>
      {primaryScreenshot ? (
        <button
          className="screenshotPreview"
          type="button"
          onClick={() => onOpenArtifact({ run, kind: "screenshot", url: primaryScreenshot })}
          aria-label={`Open screenshot for ${run.runId}`}
        >
          <img src={appUrl(primaryScreenshot)} alt={`${run.runId} screenshot preview`} loading="lazy" />
        </button>
      ) : null}
      <div className="artifactButtons">
        {run.artifacts.site ? (
          <a href={appUrl(run.artifacts.site)} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            Open app
          </a>
        ) : null}
        {artifacts
          .filter((item) => item.url)
          .map((item) => (
            <button key={item.kind} type="button" onClick={() => onOpenArtifact({ run, kind: item.kind, url: item.url! })}>
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
      </div>
    </article>
  );
}

function UpliftView({ runs, tasks }: { runs: RunResult[]; tasks: TaskSpec[] }) {
  const agents = unique(runs.map((run) => run.agent));
  return (
    <section className="panel" aria-labelledby="uplift-title">
      <div className="panelHeader">
        <h2 id="uplift-title">Mode uplift</h2>
        <span>{tasks.length} tasks</span>
      </div>
      <div className="upliftTable" role="table">
        <div className="matrixHead">Model</div>
        <div className="matrixHead">Baseline</div>
        <div className="matrixHead">Ponytail</div>
        <div className="matrixHead">Furry</div>
        {agents.map((agent) => {
          const byMode = (mode: string) => runs.filter((run) => run.agent === agent && run.mode === mode);
          return (
            <div className="upliftRow" key={agent}>
              <strong>{agentLabels[agent]}</strong>
              {["baseline", "ponytail", "furry"].map((mode) => {
                const group = byMode(mode);
                const uplift = average(group.map((run) => run.scores.skillUplift ?? 0));
                return (
                  <span key={mode}>
                    {average(group.map((run) => run.scores.total)).toFixed(1)}
                    {mode !== "baseline" ? ` (${formatSigned(uplift)})` : ""}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ArtifactDrawer({
  artifact,
  onClose,
}: {
  artifact: { run: RunResult; kind: ArtifactKind; url: string };
  onClose: () => void;
}) {
  const [content, setContent] = useState<string>("Loading...");

  useEffect(() => {
    if (artifact.kind === "screenshot") return;
    void fetch(appUrl(artifact.url))
      .then((response) => response.text())
      .then(setContent)
      .catch((fetchError: unknown) => setContent(fetchError instanceof Error ? fetchError.message : String(fetchError)));
  }, [artifact]);

  return (
    <aside className="drawer" aria-label="Artifact drawer">
      <div className="drawerHeader">
        <div>
          <h2>{artifact.kind}</h2>
          <p>{artifact.run.runId}</p>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {artifact.kind === "screenshot" ? <img src={appUrl(artifact.url)} alt={`${artifact.run.runId} screenshot`} /> : <pre>{content}</pre>}
    </aside>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="emptyState">
      <h1>{title}</h1>
      <p>{body}</p>
      <code>pnpm bench:dry-run</code>
    </section>
  );
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: typeof RefreshCcw; onClick: () => void }) {
  return (
    <button className="iconButton" type="button" title={label} aria-label={label} onClick={onClick}>
      <Icon size={17} />
      <span>{label}</span>
    </button>
  );
}

async function loadIndex(): Promise<ResultIndex> {
  const response = await fetch(appUrl("results/index.json"), { cache: "no-store" });
  if (!response.ok) throw new Error(`public/results/index.json returned ${response.status}`);
  return response.json();
}

function toggleRun(current: string[], runId: string): string[] {
  if (current.includes(runId)) return current.filter((id) => id !== runId);
  return current.length >= 3 ? current : [...current, runId];
}

function bestRun(runs: RunResult[]): RunResult | null {
  return [...runs].sort((a, b) => b.scores.total - a.scores.total)[0] ?? null;
}

function average(values: number[]): number {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length === 0 ? 0 : usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function downloadJson(index: ResultIndex): void {
  downloadFile("furmark-results.json", JSON.stringify(index, null, 2), "application/json");
}

function downloadCsv(runs: RunResult[]): void {
  const header = ["batchId", "agent", "mode", "taskId", "status", "total", "correctness", "visual", "animation", "codeQuality", "styleCompliance"];
  const rows = runs.map((run) =>
    [
      run.batchId,
      run.agent,
      run.mode,
      run.taskId,
      run.status,
      run.scores.total,
      run.scores.correctness,
      run.scores.visual,
      run.scores.animation,
      run.scores.codeQuality,
      run.scores.styleCompliance,
    ].join(","),
  );
  downloadFile("furmark-results.csv", [header.join(","), ...rows].join("\n"), "text/csv");
}

function downloadFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
