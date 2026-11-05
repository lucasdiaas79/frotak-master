export type TaskStatus =
  | 'DRAFT'
  | 'CONTEXT_BUILDING'
  | 'SPECIFYING'
  | 'PLANNING'
  | 'IMPLEMENTING'
  | 'INTEGRATING'
  | 'TESTING'
  | 'REVIEWING'
  | 'PREVIEWING'
  | 'AWAITING_OWNER_APPROVAL'
  | 'APPROVED'
  | 'DEPLOYING'
  | 'VERIFYING'
  | 'DONE'
  | 'REJECTED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'CANCELLED'
  | 'NEEDS_HUMAN'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type AgentRole =
  | 'PRODUCT'
  | 'ARCHITECT'
  | 'BACKEND_DATA'
  | 'FRONTEND_UX'
  | 'QA'
  | 'SECURITY'
  | 'REVIEWER'
  | 'RELEASE'

export type ArtifactType =
  | 'CONTEXT_SNAPSHOT'
  | 'PRODUCT_SPEC'
  | 'TECHNICAL_PLAN'
  | 'PATCH'
  | 'TEST_REPORT'
  | 'SECURITY_REPORT'
  | 'REVIEW_REPORT'
  | 'PREVIEW'
  | 'DECISION_PACKAGE'
  | 'OWNER_APPROVAL'
  | 'RELEASE'
  | 'ROLLBACK'

export interface FeatureRequest {
  id: string
  title: string
  request: string
  requestedBy: 'owner:lucas'
  createdAt: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  constraints?: string[]
}

export interface SourceRef {
  id: string
  type:
    | 'SOURCE_CODE'
    | 'DB_MIGRATION'
    | 'ARCHITECTURE_DOC'
    | 'CURRENT_STATE_DOC'
    | 'DOMAIN_RULE'
    | 'TEST'
    | 'PULL_REQUEST'
    | 'ISSUE'
    | 'DEPLOYMENT'
    | 'RUNTIME_ERROR'
    | 'MANUAL_DECISION'
  repository?: string
  pathOrUrl: string
  revision?: string
  contentHash?: string
  authorityRank: number
  capturedAt: string
}

export interface ContextConflict {
  subject: string
  refs: string[]
  explanation: string
  blocksImplementation: boolean
}

export interface ContextPackage {
  taskId: string
  repositorySha: string
  scope: string[]
  relevantFiles: string[]
  domainRules: string[]
  schemaRefs: string[]
  tests: string[]
  recentChanges: string[]
  knownRisks: string[]
  conflicts: ContextConflict[]
  sourceRefs: SourceRef[]
  createdAt: string
}

export interface ForgeArtifact<T = unknown> {
  id: string
  taskId: string
  runId: string
  type: ArtifactType
  producer: AgentRole | 'SYSTEM' | 'owner:lucas'
  version: number
  createdAt: string
  sourceRefs: string[]
  contentHash: string
  payload: T
}

export interface ChangeSurface {
  frontend: boolean
  backend: boolean
  database: boolean
  authOrRls: boolean
  driverApp: boolean
  externalIntegration: boolean
  productionConfig: boolean
  destructiveOperation: boolean
}

export interface TechnicalPlan {
  summary: string
  risk: RiskLevel
  surfaces: ChangeSurface
  filesLikelyAffected: string[]
  migrationsLikely: boolean
  testStrategy: string[]
  rolloutStrategy: string[]
  rollbackStrategy: string[]
}

export interface ForgeTask {
  id: string
  request: FeatureRequest
  status: TaskStatus
  risk: RiskLevel
  branchName?: string
  headSha?: string
  previewUrl?: string
  currentRunId: string
  createdAt: string
  updatedAt: string
}

export interface DecisionPackage {
  taskId: string
  runId: string
  commitSha: string
  previewUrl: string
  summary: string
  testsPassed: string[]
  testsMissing: string[]
  residualRisks: string[]
  rollbackPlan: string[]
  estimatedCost?: number
}

export interface OwnerApproval {
  taskId: string
  runId: string
  previewCommitSha: string
  approvedBy: 'owner:lucas'
  action: 'APPROVE_PRODUCTION'
  approvedAt: string
}
