import type { ForgeTask, OwnerApproval, TaskStatus } from './contracts.js'

const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  DRAFT: ['CONTEXT_BUILDING', 'CANCELLED'],
  CONTEXT_BUILDING: ['SPECIFYING', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED'],
  SPECIFYING: ['PLANNING', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED'],
  PLANNING: ['IMPLEMENTING', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED'],
  IMPLEMENTING: ['INTEGRATING', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED'],
  INTEGRATING: ['TESTING', 'IMPLEMENTING', 'FAILED', 'CANCELLED'],
  TESTING: ['REVIEWING', 'IMPLEMENTING', 'FAILED', 'CANCELLED'],
  REVIEWING: ['PREVIEWING', 'IMPLEMENTING', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED'],
  PREVIEWING: ['AWAITING_OWNER_APPROVAL', 'FAILED', 'CANCELLED'],
  AWAITING_OWNER_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['DEPLOYING', 'CANCELLED'],
  DEPLOYING: ['VERIFYING', 'FAILED', 'ROLLED_BACK'],
  VERIFYING: ['DONE', 'ROLLED_BACK', 'FAILED'],
  DONE: [],
  REJECTED: ['PLANNING', 'IMPLEMENTING', 'CANCELLED'],
  FAILED: ['CONTEXT_BUILDING', 'PLANNING', 'IMPLEMENTING', 'CANCELLED'],
  ROLLED_BACK: ['PLANNING', 'CANCELLED'],
  CANCELLED: [],
  NEEDS_HUMAN: ['CONTEXT_BUILDING', 'SPECIFYING', 'PLANNING', 'IMPLEMENTING', 'CANCELLED'],
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to)
}

export function transitionTask(task: ForgeTask, to: TaskStatus, now = new Date().toISOString()): ForgeTask {
  if (!canTransition(task.status, to)) {
    throw new Error(`Invalid Forge transition: ${task.status} -> ${to}`)
  }

  return {
    ...task,
    status: to,
    updatedAt: now,
  }
}

export function approveForProduction(
  task: ForgeTask,
  approval: OwnerApproval,
  now = new Date().toISOString(),
): ForgeTask {
  if (task.status !== 'AWAITING_OWNER_APPROVAL') {
    throw new Error('Task is not waiting for owner approval.')
  }

  if (approval.taskId !== task.id || approval.runId !== task.currentRunId) {
    throw new Error('Approval does not belong to the active Forge run.')
  }

  if (!task.headSha || approval.previewCommitSha !== task.headSha) {
    throw new Error('Approval is stale: preview commit changed after approval target was created.')
  }

  return {
    ...task,
    status: 'APPROVED',
    updatedAt: now,
  }
}

export function assertProductionDeployAllowed(task: ForgeTask): void {
  if (task.status !== 'APPROVED') {
    throw new Error('Production deploy is blocked until explicit owner approval is recorded.')
  }
}

export const forgeTransitions = transitions
