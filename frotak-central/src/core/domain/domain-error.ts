export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "RULE_VIOLATION"
  | "UNAVAILABLE";

/**
 * Erro de regra de negocio com mensagem pronta para o operador.
 * As camadas externas traduzem erros de infraestrutura para DomainError
 * antes de sair do servidor; detalhes tecnicos ficam apenas no log.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
