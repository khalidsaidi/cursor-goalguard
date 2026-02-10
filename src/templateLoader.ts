import type { ExtensionContext } from "vscode";
import type { LoadedTemplates } from "./types";

type AnyLoaded = any;

export function loadTemplates(context: ExtensionContext): LoadedTemplates {
  const modPath = context.asAbsolutePath("assets/workspace-templates.cjs");
  const mod: AnyLoaded = require(modPath);
  if (!mod?.WORKSPACE_TEMPLATES || !mod?.MANAGED_MARKER || !mod?.MANAGED_HTML_MARKER) {
    throw new Error("GoalGuard: failed to load workspace templates from assets.");
  }
  return mod as LoadedTemplates;
}
