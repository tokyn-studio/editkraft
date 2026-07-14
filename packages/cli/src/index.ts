import pc from "picocolors";
import { init } from "./commands/init";
import { doctor } from "./commands/doctor";
import { scan } from "./commands/scan";

const HELP = `${pc.bold("editkraft")} – visual CMS for Next.js + Supabase

${pc.bold("Usage:")}
  npx editkraft <command> [options]

${pc.bold("Commands:")}
  init      Sets up Editkraft in the current project (migration, config, registry, routes)
  doctor    Checks migration state, ENV, and registry consistency
  scan      Read-only scan for collection candidates (frontmatter dirs, object arrays)

${pc.bold("Options:")}
  --yes, -y     Non-interactive (accepts defaults)
  --force       Overwrite existing files
  --json        Machine-readable output (scan)
  --cwd <dir>   Target directory (default: current)
  --help, -h    Show this help
`;

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const command = args.find((a) => !a.startsWith("-"));
  const has = (...flags: string[]) => flags.some((f) => args.includes(f));
  const value = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    command,
    yes: has("--yes", "-y"),
    force: has("--force"),
    json: has("--json"),
    help: has("--help", "-h"),
    cwd: value("--cwd") ?? process.cwd(),
  };
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.help || !args.command) {
    process.stdout.write(HELP);
    return args.command ? 0 : args.help ? 0 : 1;
  }

  switch (args.command) {
    case "init":
      return init({ cwd: args.cwd, yes: args.yes, force: args.force });
    case "doctor":
      return doctor({ cwd: args.cwd });
    case "scan":
      return scan({ cwd: args.cwd, json: args.json });
    default:
      process.stderr.write(pc.red(`Unknown command: ${args.command}\n\n`) + HELP);
      return 1;
  }
}

run(process.argv).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(pc.red(`Error: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exitCode = 1;
  },
);
