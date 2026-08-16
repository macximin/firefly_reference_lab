#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const specs = [
  ["early_001_235/episodes.jsonl", 1, 235],
  ["middle_236_469/episodes.jsonl", 236, 469],
  ["late_470_703/episodes_470_475_parent.jsonl", 470, 475],
  ["late_470_703/episodes_476_703.jsonl", 476, 703],
];

const required = [
  "sequence", "visible_label", "title", "start_line", "end_line", "entry_state",
  "reader_promise", "protagonist_goal", "action", "resistance_or_cost", "turn_or_reveal",
  "paid_reward", "state_change_axis", "state_change", "ending_hook", "closed_loops",
  "opened_loops", "arc_id", "confidence", "arc_phase", "concrete_event", "tension_1_10",
  "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight",
  "emotion_weight", "material_or_status_weight", "pacing_note", "notes",
];
const repetitionFields = [
  "entry_state", "reader_promise", "protagonist_goal", "resistance_or_cost", "paid_reward",
  "state_change", "closed_loops", "opened_loops", "pacing_note",
];

let failures = 0;
for (const [relativePath, start, end] of specs) {
  const path = resolve(import.meta.dirname, relativePath);
  const text = await readFile(path, "utf8");
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      failures += 1;
      console.error(`${relativePath}:${index + 1}: invalid JSON: ${error.message}`);
    }
  }
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const expected = start + index;
    if (Number(row.sequence) !== expected) {
      failures += 1;
      console.error(`${relativePath}:${index + 1}: expected sequence ${expected}, got ${row.sequence}`);
    }
    if (seen.has(row.sequence)) {
      failures += 1;
      console.error(`${relativePath}: duplicate sequence ${row.sequence}`);
    }
    seen.add(row.sequence);
    for (const key of required) {
      if (!(key in row) || (key !== "notes" && String(row[key] ?? "").trim() === "")) {
        failures += 1;
        console.error(`${relativePath}:${row.sequence}: blank or missing ${key}`);
      }
    }
    for (const key of ["tension_1_10", "reward_1_10", "hook_1_10", "information_weight", "action_weight", "relationship_weight", "emotion_weight", "material_or_status_weight"]) {
      const score = Number(row[key]);
      if (!Number.isInteger(score) || score < 1 || score > 10) {
        failures += 1;
        console.error(`${relativePath}:${row.sequence}: invalid ${key}=${row[key]}`);
      }
    }
  }
  for (const key of repetitionFields) {
    const counts = new Map();
    for (const row of rows) {
      const value = String(row[key] ?? "").trim();
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const repeated = [...counts.entries()].filter(([, count]) => count >= 5);
    if (repeated.length) {
      failures += repeated.length;
      for (const [value, count] of repeated) console.error(`${relativePath}: ${key} repeated ${count} times: ${value}`);
    }
  }
  const last = rows.at(-1)?.sequence ?? start - 1;
  const state = rows.length === end - start + 1 ? "complete" : `in progress through ${last}`;
  console.log(`${relativePath}: ${rows.length}/${end - start + 1} rows, ${state}`);
}

if (failures) {
  console.error(`check failed with ${failures} finding(s)`);
  process.exitCode = 1;
} else {
  console.log("check passed with 0 findings");
}
