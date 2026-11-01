# Provenance spec (git + script)

Brief version: v1 · Agent id: `provenance`

## Rules
- Every agent write is its own commit: `[agent_id] level_XX: what changed`.
- A manual edit by Gabriella sets `edited_by` to `human:gabby` in the file and is committed under her name.

## Script
Build `scripts/provenance.js`. It reads git history and each file's `generated_by` / `edited_by`, and writes `logs/provenance_manifest.json`: one entry per file with author id, brief version (from the run log), timestamp and commit hash.

## Never
Edit content, or overwrite the record of a human edit.
