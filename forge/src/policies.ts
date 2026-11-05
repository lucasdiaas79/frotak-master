import type { AgentRole, ChangeSurface, RiskLevel, TechnicalPlan } from './contracts.js'

export interface ForgePolicyDecision {
  risk: RiskLevel
  requiredAgents: AgentRole[]
  requiredGates: Array<'MIGRATION' | 'AUTH_RLS' | 'REAL_DATA' | 'PRODUCTION'>
  productionApprovalRequired: true
  notes: string[]
}

const pushUnique = <T>(items: T[], value: T) => {
  if (!items.includes(value)) items.push(value)
}

export function evaluatePlanPolicy(plan: TechnicalPlan): ForgePolicyDecision {
  const requiredAgents: AgentRole[] = ['PRODUCT', 'ARCHITECT', 'REVIEWER', 'RELEASE']
  const requiredGates: ForgePolicyDecision['requiredGates'] = ['PRODUCTION']
  const notes: string[] = []
  let risk: RiskLevel = plan.risk

  if (plan.surfaces.backend || plan.surfaces.database) {
    pushUnique(requiredAgents, 'BACKEND_DATA')
  }

  if (plan.surfaces.frontend || plan.surfaces.driverApp) {
    pushUnique(requiredAgents, 'FRONTEND_UX')
  }

  if (
    plan.surfaces.frontend ||
    plan.surfaces.backend ||
    plan.surfaces.database ||
    plan.surfaces.driverApp ||
    plan.surfaces.externalIntegration
  ) {
    pushUnique(requiredAgents, 'QA')
  }

  if (plan.surfaces.database) {
    pushUnique(requiredGates, 'MIGRATION')
    pushUnique(requiredAgents, 'SECURITY')
    notes.push('Mudança de banco exige revisão de migration, compatibilidade e rollback.')
    if (risk === 'LOW') risk = 'MEDIUM'
  }

  if (plan.surfaces.authOrRls) {
    pushUnique(requiredGates, 'AUTH_RLS')
    pushUnique(requiredAgents, 'SECURITY')
    notes.push('Auth/RLS é área crítica e não pode avançar sem revisão dedicada.')
    risk = risk === 'CRITICAL' ? 'CRITICAL' : 'HIGH'
  }

  if (plan.surfaces.productionConfig || plan.surfaces.destructiveOperation) {
    pushUnique(requiredAgents, 'SECURITY')
    notes.push('Ação com potencial de efeito irreversível requer gate humano reforçado.')
    risk = 'CRITICAL'
  }

  return {
    risk,
    requiredAgents,
    requiredGates,
    productionApprovalRequired: true,
    notes,
  }
}

export function requiresSecurityReview(surface: ChangeSurface): boolean {
  return (
    surface.database ||
    surface.authOrRls ||
    surface.externalIntegration ||
    surface.productionConfig ||
    surface.destructiveOperation
  )
}
