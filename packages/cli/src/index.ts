import pc from "picocolors";
import { init } from "./commands/init";
import { doctor } from "./commands/doctor";

const HELP = `${pc.bold("editkraft")} – visuelles CMS für Next.js + Supabase

${pc.bold("Verwendung:")}
  npx editkraft <command> [optionen]

${pc.bold("Commands:")}
  init      Richtet Editkraft im aktuellen Projekt ein (Migration, Config, Registry, Routen)
  doctor    Prüft Migrationstand, ENV und Registry-Konsistenz

${pc.bold("Optionen:")}
  --yes, -y     Nicht-interaktiv (nimmt Defaults an)
  --force       Vorhandene Dateien überschreiben
  --cwd <dir>   Zielverzeichnis (Default: aktuelles)
  --help, -h    Diese Hilfe
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
    default:
      process.stderr.write(pc.red(`Unbekannter Command: ${args.command}\n\n`) + HELP);
      return 1;
  }
}

run(process.argv).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(pc.red(`Fehler: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exitCode = 1;
  },
);
