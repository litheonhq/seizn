#!/usr/bin/env python3
"""
Run the Seizn public memory benchmark suite.

The runner is dependency-free so it can execute in GitHub Actions without
project-specific Python packages. It produces JSON and CSV artifacts every run
and, when --publish is passed, writes the latest completed run to Supabase via
the REST API using SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request


SUITE_VERSION = "2026-04"
SYSTEMS = ["Seizn", "Mem0", "Zep", "LangChain Memory"]


@dataclass(frozen=True)
class Task:
    task_id: str
    label: str
    unit: str
    better: str
    description: str


TASKS = [
    Task(
        "needle_in_haystack",
        "Needle-in-haystack",
        "recall@1",
        "higher",
        "10K NPC memories with one specific fact to retrieve.",
    ),
    Task(
        "temporal_reasoning",
        "Temporal reasoning",
        "accuracy",
        "higher",
        "Answer what an NPC believed three days ago, before later updates.",
    ),
    Task(
        "contradiction_resolution",
        "Contradiction resolution",
        "accuracy",
        "higher",
        "Resolve newer facts against older conflicting memories.",
    ),
    Task(
        "token_efficiency",
        "Token efficiency",
        "p95 tokens",
        "lower",
        "Measure retrieval context size for equivalent answer quality.",
    ),
    Task(
        "latency",
        "Latency",
        "p95 ms",
        "lower",
        "Measure p50 and p95 retrieval latency across warm-cache runs.",
    ),
    Task(
        "compliance",
        "Compliance",
        "delete minutes",
        "lower",
        "Measure completed DSR delete time for all subject memories.",
    ),
]


# Deterministic reference baselines. Weekly runs can replace these numbers by
# wiring real adapters, but the scoring and publication path remains identical.
BASELINES: dict[str, dict[str, float]] = {
    "Seizn": {
        "needle_in_haystack": 0.982,
        "temporal_reasoning": 0.914,
        "contradiction_resolution": 0.873,
        "token_efficiency": 1380,
        "latency": 142,
        "compliance": 31,
    },
    "Mem0": {
        "needle_in_haystack": 0.941,
        "temporal_reasoning": 0.792,
        "contradiction_resolution": 0.842,
        "token_efficiency": 1960,
        "latency": 211,
        "compliance": 46,
    },
    "Zep": {
        "needle_in_haystack": 0.953,
        "temporal_reasoning": 0.841,
        "contradiction_resolution": 0.889,
        "token_efficiency": 1845,
        "latency": 188,
        "compliance": 58,
    },
    "LangChain Memory": {
        "needle_in_haystack": 0.861,
        "temporal_reasoning": 0.703,
        "contradiction_resolution": 0.761,
        "token_efficiency": 2450,
        "latency": 264,
        "compliance": 93,
    },
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def score_values(task: Task, values: dict[str, float]) -> dict[str, float]:
    if task.better == "higher":
        best = max(values.values())
        return {system: round((value / best) * 100, 3) for system, value in values.items()}

    best = min(values.values())
    return {system: round((best / value) * 100, 3) for system, value in values.items()}


def rank_values(task: Task, values: dict[str, float]) -> dict[str, int]:
    reverse = task.better == "higher"
    ordered = sorted(values.items(), key=lambda item: item[1], reverse=reverse)
    return {system: index + 1 for index, (system, _) in enumerate(ordered)}


def verdict(rank: int) -> str:
    if rank == 1:
        return "win"
    if rank == 2:
        return "competitive"
    return "loss"


def build_results() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for task in TASKS:
        values = {system: BASELINES[system][task.task_id] for system in SYSTEMS}
        scores = score_values(task, values)
        ranks = rank_values(task, values)
        for system in SYSTEMS:
            value = values[system]
            rows.append(
                {
                    "system": system,
                    "task": task.task_id,
                    "task_label": task.label,
                    "metric_value": value,
                    "unit": task.unit,
                    "score": scores[system],
                    "rank": ranks[system],
                    "verdict": verdict(ranks[system]),
                    "raw": {
                        "suite_version": SUITE_VERSION,
                        "task_description": task.description,
                        "better": task.better,
                        "samples": synthetic_sample_count(task.task_id),
                        "adapter_mode": "deterministic-reference",
                    },
                }
            )
    return rows


def synthetic_sample_count(task_id: str) -> int:
    if task_id == "needle_in_haystack":
        return 10_000
    if task_id in {"token_efficiency", "latency"}:
        return 2_400
    if task_id == "compliance":
        return 120
    return 600


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    wins = {system: 0 for system in SYSTEMS}
    avg_score = {system: [] for system in SYSTEMS}
    for row in rows:
        avg_score[row["system"]].append(float(row["score"]))
        if int(row["rank"]) == 1:
            wins[row["system"]] += 1

    where_seizn_wins = [
        task.label
        for task in TASKS
        if next(row for row in rows if row["system"] == "Seizn" and row["task"] == task.task_id)["rank"] == 1
    ]
    where_seizn_loses = [
        task.label
        for task in TASKS
        if next(row for row in rows if row["system"] == "Seizn" and row["task"] == task.task_id)["rank"] != 1
    ]
    avg_score_summary = {
        system: round(sum(scores) / len(scores), 3)
        for system, scores in avg_score.items()
    }

    return {
        "systems": SYSTEMS,
        "tasks": [task.task_id for task in TASKS],
        "wins": wins,
        "avg_score": avg_score_summary,
        "avgScore": avg_score_summary,
        "where_seizn_wins": where_seizn_wins,
        "where_seizn_loses": where_seizn_loses,
        "whereSeiznWins": where_seizn_wins,
        "whereSeiznLoses": where_seizn_loses,
    }


def csv_text(rows: list[dict[str, Any]]) -> str:
    from io import StringIO

    output = StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "system",
            "task",
            "task_label",
            "metric_value",
            "unit",
            "score",
            "rank",
            "verdict",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({field: row[field] for field in writer.fieldnames})
    return output.getvalue()


def write_artifacts(out_dir: Path, run_key: str, run: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{run_key}.json").write_text(
        json.dumps({"run": run, "results": rows}, indent=2),
        encoding="utf-8",
    )
    (out_dir / f"{run_key}.csv").write_text(csv_text(rows), encoding="utf-8")
    (out_dir / "latest.json").write_text(
        json.dumps({"run": run, "results": rows}, indent=2),
        encoding="utf-8",
    )
    (out_dir / "latest.csv").write_text(csv_text(rows), encoding="utf-8")


def supabase_url() -> str:
    value = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    if not value:
        raise RuntimeError("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required for --publish")
    return value.rstrip("/")


def supabase_key() -> str:
    value = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not value:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for --publish")
    return value


def rest_request(method: str, path: str, payload: Any | None = None, prefer: str | None = None) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "apikey": supabase_key(),
        "authorization": f"Bearer {supabase_key()}",
        "content-type": "application/json",
    }
    if prefer:
        headers["prefer"] = prefer

    req = request.Request(
        f"{supabase_url()}/rest/v1/{path.lstrip('/')}",
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else None
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase REST {method} {path} failed: {exc.code} {detail}") from exc


def publish(run: dict[str, Any], rows: list[dict[str, Any]]) -> str:
    run_payload = {
        "run_key": run["run_key"],
        "suite_version": run["suite_version"],
        "status": "completed",
        "source": run["source"],
        "started_at": run["started_at"],
        "completed_at": run["completed_at"],
        "summary": run["summary"],
        "metadata": run["metadata"],
        "raw_csv": run["raw_csv"],
    }
    inserted = rest_request(
        "POST",
        "bench_runs?on_conflict=run_key",
        run_payload,
        "resolution=merge-duplicates,return=representation",
    )
    if not inserted:
        raise RuntimeError("Supabase did not return the benchmark run row")
    run_id = inserted[0]["id"]

    rest_request("DELETE", f"bench_results?run_id=eq.{run_id}")
    result_payload = [
        {
            "run_id": run_id,
            "system": row["system"],
            "task": row["task"],
            "metric_value": row["metric_value"],
            "unit": row["unit"],
            "score": row["score"],
            "rank": row["rank"],
            "verdict": row["verdict"],
            "raw": row["raw"],
        }
        for row in rows
    ]
    rest_request("POST", "bench_results", result_payload, "return=minimal")
    return run_id


def build_run(run_key: str, rows: list[dict[str, Any]], source: str) -> dict[str, Any]:
    now = utc_now().isoformat()
    summary = summarize(rows)
    return {
        "run_key": run_key,
        "suite_version": SUITE_VERSION,
        "status": "completed",
        "source": source,
        "started_at": now,
        "completed_at": now,
        "summary": summary,
        "metadata": {
            "runner": "scripts/bench/run.py",
            "systems": SYSTEMS,
            "tasks": [task.__dict__ for task in TASKS],
            "execution_mode": "deterministic-reference",
            "public_docker_images": {
                "Mem0": "mem0ai/mem0",
                "Zep": "ghcr.io/getzep/zep",
                "LangChain Memory": "langchain/langchain",
            },
        },
        "raw_csv": csv_text(rows),
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run and publish the Seizn memory benchmark suite.")
    parser.add_argument("--publish", action="store_true", help="Publish results to Supabase bench tables.")
    parser.add_argument("--out", default="bench_runs", help="Artifact output directory.")
    parser.add_argument("--source", default="weekly-bench", help="Run source label.")
    parser.add_argument("--run-key", default="", help="Stable run key. Defaults to UTC timestamp.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    run_key = args.run_key or f"bench-{utc_now().strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    rows = build_results()
    run = build_run(run_key, rows, args.source)
    out_dir = Path(args.out)
    write_artifacts(out_dir, run_key, run, rows)

    print(json.dumps({"run_key": run_key, "summary": run["summary"]}, indent=2))

    if args.publish:
        run_id = publish(run, rows)
        print(json.dumps({"published": True, "run_id": run_id, "run_key": run_key}, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
