import type {
  AgentRole,
  ContextPackage,
  DecisionPackage,
  FeatureRequest,
  ForgeArtifact,
  TechnicalPlan,
} from './contracts.js'

export interface ModelAdapter {
  run<TOutput>(input: {
    role: AgentRole
    task: FeatureRequest
    context: ContextPackage
    instructions: string
    artifactInputs: ForgeArtifact[]
  }): Promise<TOutput>
}

export interface GitProvider {
  getHeadSha(repository: string, branch: string): Promise<string>
  createTaskBranch(repository: string, baseSha: string, branch: string): Promise<void>
  commitFiles(input: {
    repository: string
    branch: string
    message: string
    files: Array<{ path: string; content: string }>
  }): Promise<{ commitSha: string }>
  openPullRequest(input: {
    repository: string
    head: string
    base: string
    title: string
    body: string
  }): Promise<{ number: number; url: string }>
}

export interface KnowledgeRepository {
  buildContext(input: {
    repository: string
    repositorySha: string
    request: FeatureRequest
  }): Promise<ContextPackage>
}

export interface SandboxRunner {
  run(input: {
    taskId: string
    command: string
    cwd: string
    timeoutMs: number
    networkPolicy: 'NONE' | 'ALLOWLIST'
  }): Promise<{ exitCode: number; stdout: string; stderr: string }>
}

export interface PreviewProvider {
  createPreview(input: {
    taskId: string
    repository: string
    commitSha: string
    requiresDatabasePreview: boolean
  }): Promise<{ url: string; deploymentId: string; databaseRef?: string }>
}

export interface ReleaseProvider {
  deployApproved(input: {
    decision: DecisionPackage
    approvalArtifactId: string
  }): Promise<{ deploymentId: string; productionCommitSha: string }>
}

export interface WorkflowStore {
  saveArtifact(artifact: ForgeArtifact): Promise<void>
  getArtifacts(taskId: string): Promise<ForgeArtifact[]>
  savePlan(taskId: string, plan: TechnicalPlan): Promise<void>
}
