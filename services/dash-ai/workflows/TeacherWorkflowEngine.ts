/**
 * Teacher Workflow Engine
 *
 * Orchestrates multi-step AI workflows for teachers by:
 *  1. Instantiating workflow templates into executable DashTasks
 *  2. Executing steps in dependency order (DAG traversal)
 *  3. Calling AI tools and Edge Functions per step
 *  4. Pausing at approval gates for teacher review
 *  5. Tracking token usage, timing, and audit trail
 *
 * Built on top of existing DashToolRegistry and ai-proxy infrastructure.
 *
 * @module services/dash-ai/workflows/TeacherWorkflowEngine
 */

import { assertSupabase } from '@/lib/supabase'
import { isAIEnabled } from '@/lib/ai/aiConfig'
import { assertQuotaForService } from '@/lib/ai/guards'
import { track } from '@/lib/analytics'
import type { DashTask, DashTaskStep } from '@/services/dash-ai/types'
import type {
  WorkflowTemplate,
  WorkflowStepTemplate,
  WorkflowExecution,
  StepResult,
  WorkflowEvent,
  TeacherWorkflowTemplateId,
} from './types'
import { WORKFLOW_TEMPLATES } from './templates'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkflowEventListener = (event: WorkflowEvent) => void

interface ExecutionContext {
  userId: string
  organizationId: string
  params: Record<string, unknown>
  /** Accumulated results from completed steps — used for {{step_result}} interpolation */
  results: Map<string, unknown>
  /** Event listener for real-time UI updates */
  onEvent?: WorkflowEventListener
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class TeacherWorkflowEngine {
  private static executions = new Map<string, WorkflowExecution>()

  /**
   * Start a new workflow from a template.
   *
   * @returns The execution ID for tracking progress
   */
  static async startWorkflow(
    templateId: TeacherWorkflowTemplateId,
    userId: string,
    organizationId: string,
    params: Record<string, unknown>,
    onEvent?: WorkflowEventListener,
  ): Promise<string> {
    if (!isAIEnabled()) {
      throw new WorkflowError('AI features are not enabled', 'ai_disabled')
    }

    const template = WORKFLOW_TEMPLATES[templateId]
    if (!template) {
      throw new WorkflowError(`Unknown workflow template: ${templateId}`, 'invalid_template')
    }

    // Validate required params
    for (const param of template.requiredParams) {
      if (param.required !== false && !(param.key in params)) {
        throw new WorkflowError(
          `Missing required parameter: ${param.key}`,
          'missing_param',
        )
      }
    }

    // Create execution
    const executionId = crypto.randomUUID()
    const task = this.templateToTask(template, userId, params)

    const execution: WorkflowExecution = {
      id: executionId,
      templateId,
      task,
      initiatedBy: userId,
      organizationId,
      phase: 'planning',
      stepResults: new Map(),
      startedAt: Date.now(),
      endedAt: null,
      tokenUsage: { input: 0, output: 0, cost: 0 },
    }

    this.executions.set(executionId, execution)

    track('edudash.ai.workflow.started', {
      template_id: templateId,
      step_count: template.steps.length,
    })

    // Execute steps asynchronously
    const context: ExecutionContext = {
      userId,
      organizationId,
      params,
      results: new Map(),
      onEvent,
    }

    // Don't await — let it run asynchronously
    this.executeSteps(execution, template.steps, context).catch((err) => {
      execution.phase = 'failed'
      execution.endedAt = Date.now()
      onEvent?.({ type: 'workflow_failed', executionId, error: String(err) })
    })

    return executionId
  }

  /**
   * Get the current status of a workflow execution.
   */
  static getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId)
  }

  /**
   * Approve a step that's waiting for teacher approval.
   */
  static async approveStep(
    executionId: string,
    stepId: string,
  ): Promise<boolean> {
    const execution = this.executions.get(executionId)
    if (!execution) return false

    const step = execution.task.steps.find((s) => s.id === stepId)
    if (!step || step.status !== 'in_progress') return false

    step.status = 'completed'
    execution.phase = 'executing'

    track('edudash.ai.workflow.step_approved', {
      execution_id: executionId,
      step_id: stepId,
    })

    return true
  }

  /**
   * Cancel a running workflow.
   */
  static cancelWorkflow(executionId: string): boolean {
    const execution = this.executions.get(executionId)
    if (!execution) return false

    execution.phase = 'cancelled'
    execution.endedAt = Date.now()
    execution.task.status = 'failed'

    track('edudash.ai.workflow.cancelled', { execution_id: executionId })

    return true
  }

  /**
   * Get all active workflows for a user.
   */
  static getActiveWorkflows(userId: string): WorkflowExecution[] {
    const active: WorkflowExecution[] = []
    for (const execution of this.executions.values()) {
      if (
        execution.initiatedBy === userId &&
        (execution.phase === 'executing' ||
          execution.phase === 'awaiting_approval' ||
          execution.phase === 'planning')
      ) {
        active.push(execution)
      }
    }
    return active
  }

  // =========================================================================
  // Private — Execution Engine
  // =========================================================================

  /**
   * Execute workflow steps in dependency order.
   * Steps without dependencies run first, then dependent steps.
   */
  private static async executeSteps(
    execution: WorkflowExecution,
    stepTemplates: WorkflowStepTemplate[],
    context: ExecutionContext,
  ): Promise<void> {
    execution.phase = 'executing'

    // Build dependency graph
    const completed = new Set<string>()
    const remaining = new Set(stepTemplates.map((s) => s.id))

    while (remaining.size > 0) {
      // Find steps whose dependencies are all met
      const ready = stepTemplates.filter(
        (s) =>
          remaining.has(s.id) &&
          (s.dependsOn ?? []).every((dep) => completed.has(dep)),
      )

      if (ready.length === 0) {
        throw new WorkflowError(
          'Workflow has unresolvable dependencies',
          'dependency_cycle',
        )
      }

      // Execute ready steps (could parallelize independent steps)
      for (const stepTemplate of ready) {
        if ((execution.phase as string) === 'cancelled') return

        const taskStep = execution.task.steps.find((s) => s.id === stepTemplate.id)
        if (!taskStep) continue

        context.onEvent?.({
          type: 'step_started',
          stepId: stepTemplate.id,
          stepName: stepTemplate.name,
        })

        taskStep.status = 'in_progress'
        execution.task.progress.currentStep =
          execution.task.steps.indexOf(taskStep)

        try {
          const result = await this.executeStep(
            execution,
            stepTemplate,
            context,
          )

          execution.stepResults.set(stepTemplate.id, result)
          context.results.set(stepTemplate.id, result.output)

          if (result.status === 'pending_approval') {
            // Pause and wait for teacher approval
            execution.phase = 'awaiting_approval'
            context.onEvent?.({
              type: 'approval_required',
              stepId: stepTemplate.id,
              stepName: stepTemplate.name,
              preview: result.output,
            })

            // Poll for approval
            await this.waitForApproval(execution, taskStep)
            execution.phase = 'executing'
          }

          taskStep.status = 'completed'
          execution.task.progress.completedSteps.push(stepTemplate.id)

          context.onEvent?.({
            type: 'step_completed',
            stepId: stepTemplate.id,
            result,
          })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          taskStep.status = 'failed'

          const failResult: StepResult = {
            stepId: stepTemplate.id,
            status: 'failed',
            output: null,
            error,
            duration: 0,
          }

          execution.stepResults.set(stepTemplate.id, failResult)

          context.onEvent?.({
            type: 'step_failed',
            stepId: stepTemplate.id,
            error,
          })

          // Non-approval steps failing = workflow failure
          if (stepTemplate.type !== 'approval_required') {
            throw err
          }
        }

        completed.add(stepTemplate.id)
        remaining.delete(stepTemplate.id)
      }
    }

    // All steps complete
    execution.phase = 'completed'
    execution.endedAt = Date.now()
    execution.task.status = 'completed'

    const durationSec = ((execution.endedAt - execution.startedAt) / 1000).toFixed(1)

    context.onEvent?.({
      type: 'workflow_completed',
      executionId: execution.id,
      summary: `Workflow completed in ${durationSec}s with ${completed.size} steps.`,
    })

    track('edudash.ai.workflow.completed', {
      execution_id: execution.id,
      template_id: execution.templateId,
      duration_sec: Number(durationSec),
      total_tokens: execution.tokenUsage.input + execution.tokenUsage.output,
    })
  }

  /**
   * Execute a single workflow step.
   */
  private static async executeStep(
    execution: WorkflowExecution,
    stepTemplate: WorkflowStepTemplate,
    context: ExecutionContext,
  ): Promise<StepResult> {
    const startTime = Date.now()

    if (stepTemplate.type === 'approval_required') {
      // Collect all prior results for the teacher to review
      const reviewData: Record<string, unknown> = {}
      for (const depId of stepTemplate.dependsOn ?? []) {
        reviewData[depId] = context.results.get(depId)
      }

      return {
        stepId: stepTemplate.id,
        status: 'pending_approval',
        output: reviewData,
        duration: Date.now() - startTime,
      }
    }

    if (stepTemplate.type === 'automated' && stepTemplate.promptTemplate) {
      // Interpolate prompt template with params and prior results
      const prompt = this.interpolateTemplate(
        stepTemplate.promptTemplate,
        context.params,
        context.results,
      )

      // Call AI via Edge Function
      const quota = await assertQuotaForService(
        (stepTemplate.serviceType ?? 'lesson_generation') as any, 1, context.userId,
      )
      if (!quota.allowed) throw new Error('AI quota exceeded')

      const supabase = assertSupabase()
      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          scope: 'teacher',
          service_type: stepTemplate.serviceType ?? 'lesson_generation',
          payload: {
            prompt,
            model: undefined, // Use default model per tier
          },
          metadata: {
            workflow_id: execution.id,
            step_id: stepTemplate.id,
            template_id: execution.templateId,
          },
        },
      })

      if (error) {
        throw new WorkflowError(
          `AI call failed for step ${stepTemplate.id}: ${error.message}`,
          'ai_call_failed',
        )
      }

      const result = data?.result ?? data
      const tokensUsed = data?.usage?.total_tokens ?? 0
      execution.tokenUsage.input += data?.usage?.input_tokens ?? 0
      execution.tokenUsage.output += data?.usage?.output_tokens ?? 0

      return {
        stepId: stepTemplate.id,
        status: 'success',
        output: result,
        duration: Date.now() - startTime,
        tokensUsed,
      }
    }

    // Manual or other step types — return empty result
    return {
      stepId: stepTemplate.id,
      status: 'success',
      output: null,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Wait for a teacher to approve a step (polling pattern).
   */
  private static async waitForApproval(
    execution: WorkflowExecution,
    step: DashTaskStep,
    timeoutMs = 30 * 60 * 1000, // 30 minutes
  ): Promise<void> {
    const start = Date.now()
    while (step.status !== 'completed') {
      if (execution.phase === 'cancelled') {
        throw new WorkflowError('Workflow cancelled during approval', 'cancelled')
      }
      if (Date.now() - start > timeoutMs) {
        throw new WorkflowError('Approval timeout exceeded', 'approval_timeout')
      }
      // Poll every 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  /**
   * Interpolate a prompt template with params and step results.
   * Replaces {{key}} with param values and {{stepId_result}} with prior step output.
   */
  private static interpolateTemplate(
    template: string,
    params: Record<string, unknown>,
    results: Map<string, unknown>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      // Check params first
      if (key in params) {
        const val = params[key]
        return Array.isArray(val) ? val.join(', ') : String(val ?? '')
      }

      // Check step results (format: stepId_result)
      if (key.endsWith('_result')) {
        const stepId = key.replace(/_result$/, '')
        const result = results.get(stepId)
        if (result !== undefined) {
          return typeof result === 'string' ? result : JSON.stringify(result)
        }
      }

      return match // Leave unmatched placeholders as-is
    })
  }

  /**
   * Convert a workflow template into a DashTask instance.
   */
  private static templateToTask(
    template: WorkflowTemplate,
    userId: string,
    params: Record<string, unknown>,
  ): DashTask {
    return {
      id: crypto.randomUUID(),
      title: template.name,
      description: template.description,
      type: 'workflow',
      status: 'pending',
      priority: 'medium',
      assignedTo: userId,
      createdBy: 'Dash',
      createdAt: Date.now(),
      estimatedDuration: template.estimatedDuration,
      steps: template.steps.map((s) => ({
        id: s.id,
        title: s.name,
        description: s.description,
        type: s.type,
        status: 'pending' as const,
        estimatedDuration: undefined,
        requiredData: s.dependsOn ? { dependsOn: s.dependsOn } : undefined,
        validation: s.outputValidation
          ? { required: s.outputValidation.required, criteria: [] }
          : undefined,
      })),
      dependencies: [],
      context: {
        conversationId: '',
        userRole: 'teacher',
        relatedEntities: [],
      },
      progress: {
        currentStep: 0,
        completedSteps: [],
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class WorkflowError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'WorkflowError'
    this.code = code
  }
}
