/**
 * Shell completion generators — zero-dependency templates rendered from
 * COMPLETION_SPEC. Keep the spec in sync with usage.ts COMMAND_HELP
 * (guarded by tests/unit/cli-maturity.test.ts).
 */

export interface CompletionsSpec {
  /** command -> per-command flags. */
  commands: Record<string, string[]>;
  globalFlags: string[];
}

export const SUPPORTED_SHELLS = ["bash", "zsh", "fish", "powershell"] as const;

export const COMPLETION_SPEC: CompletionsSpec = {
  globalFlags: ["--help", "-h", "--version", "-v"],
  commands: {
    init: ["--template"],
    doctor: ["--json"],
    dev: ["--entry"],
    build: ["--entry"],
    check: ["--entry", "--timeout", "--expect"],
    bench: ["--runs", "--record", "--no-gui", "--json"],
    codegen: [],
    icon: ["-o"],
    info: [],
    add: [],
    migrate: [],
    signer: [],
    version: [],
    completions: [],
  },
};

export function renderCompletions(shell: string): string | undefined {
  switch (shell) {
    case "bash":
      return bash();
    case "zsh":
      return zsh();
    case "fish":
      return fish();
    case "powershell":
      return powershell();
    default:
      return undefined;
  }
}

function commandNames(): string {
  return Object.keys(COMPLETION_SPEC.commands).join(" ");
}

function flagsFor(cmd: string): string {
  const per = COMPLETION_SPEC.commands[cmd] ?? [];
  return [...per, ...COMPLETION_SPEC.globalFlags].join(" ");
}

function caseBranches(template: (cmd: string, flags: string) => string): string {
  return Object.entries(COMPLETION_SPEC.commands)
    .map(([cmd, flags]) => template(cmd, flags.join(" ")))
    .join("\n");
}

function bash(): string {
  return `# bash completion for ztron
_ztron() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local commands="${commandNames()}"
  local global="${COMPLETION_SPEC.globalFlags.join(" ")}"
  if [[ "\${COMP_CWORD}" -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands} \${global}" -- "\${cur}") )
    return 0
  fi
  local cmd="\${COMP_WORDS[1]}"
  local flags=""
  case "\${cmd}" in
${caseBranches((cmd, flags) => `    ${cmd}) flags="${flags}" ;;`)}
  esac
  COMPREPLY=( $(compgen -W "\${flags}" -- "\${cur}") )
  return 0
}
complete -F _ztron ztron
`;
}

function zsh(): string {
  return `#compdef ztron
# zsh completion for ztron
_ztron() {
  local -a commands
  commands=(
${Object.keys(COMPLETION_SPEC.commands)
  .map((cmd) => `    '${cmd}'`)
  .join("\n")}
  )
  local -a global_flags
  global_flags=(${COMPLETION_SPEC.globalFlags.join(" ")})
  if (( CURRENT == 2 )); then
    _describe -t commands 'ztron command' commands
    _describe -t flags 'flag' global_flags
    return
  fi
  local cmd="\${words[2]}"
  local -a flags
  case "\${cmd}" in
${caseBranches((cmd, flags) => `    ${cmd}) flags=(${flags || " "}) ;;`)}
  esac
  _describe -t flags 'flag' flags
}
_ztron "$@"
`;
}

function fish(): string {
  const globalLines = COMPLETION_SPEC.globalFlags
    .map((f) => `complete -c ztron -n '__fish_use_subcommand' -l ${f.replace(/^--/, "")} -s ${f.replace(/^--/, "").slice(0, 1)}`)
    .join("\n");
  const commandLines = Object.keys(COMPLETION_SPEC.commands)
    .map((cmd) => `complete -c ztron -n '__fish_use_subcommand' -a '${cmd}'`)
    .join("\n");
  const flagLines = Object.entries(COMPLETION_SPEC.commands)
    .filter(([, flags]) => flags.length)
    .map(([cmd, flags]) =>
      flags.map((f) => `complete -c ztron -n '__fish_seen_subcommand_from ${cmd}' -l ${f.replace(/^--/, "")}`).join("\n"),
    )
    .join("\n");
  return `# fish completion for ztron
${globalLines}
${commandLines}
${flagLines}
`;
}

function powershell(): string {
  return `# PowerShell completion for ztron
Register-ArgumentCompleter -CommandName ztron -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = @('${Object.keys(COMPLETION_SPEC.commands).join("','")}')
  if ($commandAst.CommandElements.Count -le 2) {
    $commands + @('${COMPLETION_SPEC.globalFlags.join("','")}') |
      Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_) }
    return
  }
  $cmd = $commandAst.CommandElements[1].ToString()
  $flags = @('${COMPLETION_SPEC.globalFlags.join("','")}')
  switch ($cmd) {
${caseBranches((cmd, flags) => `    '${cmd}' { $flags = @('${flags || " "}') }`)}
  }
  $flags | Where-Object { $_ -like "$wordToComplete*" } |
    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_) }
}
`;
}
