import { DomainError, isDomainError } from "@/core/domain/domain-error";

/**
 * Fronteira entre o caso de uso e a resposta da server function: erros de negocio
 * seguem com a mensagem original; falhas de infraestrutura vao para o log e o
 * operador recebe uma mensagem generica, sem detalhes do banco.
 */
export async function runUseCase<T>(label: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isDomainError(error)) throw error;
    console.error(`[${label}]`, error);
    throw new DomainError("UNAVAILABLE", "Nao foi possivel concluir a operacao. Tente novamente.");
  }
}
