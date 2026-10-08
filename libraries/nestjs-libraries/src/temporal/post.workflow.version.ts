// Activation is deliberately separate from installing new workflow/handlers.
// Do not import this process-env policy into deterministic workflow code.
export function selectedPostWorkflow(): 'postWorkflowV112' | 'postWorkflowV113' {
  const version = process.env.POSTIZ_WORKFLOW_VERSION;
  if (version === undefined || version === 'V112') return 'postWorkflowV112';
  if (version === 'V113') return 'postWorkflowV113';
  throw new Error('POSTIZ_WORKFLOW_VERSION must be V112 or V113');
}
