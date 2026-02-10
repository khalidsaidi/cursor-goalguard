export type Template = {
  path: string; // workspace-relative posix path
  content: string; // UTF-8 contents
  managed: boolean; // safe to overwrite on Force Reinstall
};

export type LoadedTemplates = {
  MANAGED_MARKER: string;
  MANAGED_HTML_MARKER: string;
  WORKSPACE_TEMPLATES: Template[];
};

