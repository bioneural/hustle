#!/usr/bin/env bash
# MIT License — Copyright (c) 2026 Fort Asset LLC
#
# TaskCompleted hook for Claude Code agent teams.
# Blocks a teammate from marking a task complete while the project's tests fail.
#
# Reads the test command from HUSTLE_TEST_COMMAND, typically set per project in
# .claude/settings.json under "env". Acts only on tasks completed by a teammate.
# Exit 2 blocks completion and returns the reason to the teammate.

set -uo pipefail

input=$(cat)
teammate=$(printf '%s' "$input" | jq -r '.teammate_name // empty')
subject=$(printf '%s' "$input" | jq -r '.task_subject // "this task"')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

# Not a teammate: leave ordinary sessions alone.
[ -z "$teammate" ] && exit 0

if [ -z "${HUSTLE_TEST_COMMAND:-}" ]; then
  echo "hustle: HUSTLE_TEST_COMMAND is not set; task completion not gated." >&2
  exit 0
fi

[ -n "$cwd" ] && cd "$cwd"

if ! output=$(bash -c "$HUSTLE_TEST_COMMAND" 2>&1); then
  {
    echo "Tests fail. Fix them before completing: $subject"
    echo "Command: $HUSTLE_TEST_COMMAND"
    printf '%s\n' "$output" | tail -n 40
  } >&2
  exit 2
fi

exit 0
