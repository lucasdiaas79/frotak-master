import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@/core/domain/domain-error";
import type { IdentityGateway } from "@/modules/provisioning/application/ports";

const PAGE_SIZE = 1000;

export class SupabaseIdentityGateway implements IdentityGateway {
  constructor(private readonly supabase: SupabaseClient) {}

  async emailExists(email: string) {
    for (let page = 1; ; page += 1) {
      const { data, error } = await this.supabase.auth.admin.listUsers({
        page,
        perPage: PAGE_SIZE,
      });
      if (error) throw error;
      if (data.users.some((user) => user.email?.toLowerCase() === email)) return true;
      if (data.users.length < PAGE_SIZE) return false;
    }
  }

  async createOwner(input: { email: string; password: string; fullName: string }) {
    const { data, error } = await this.supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        must_change_password: true,
      },
    });

    if (error) {
      if (/already (been )?registered|already exists/i.test(error.message)) {
        throw new DomainError("CONFLICT", "Este e-mail já está cadastrado.");
      }
      if (/password/i.test(error.message)) {
        throw new DomainError("INVALID_INPUT", "A senha temporária não atende às regras atuais.");
      }
      throw error;
    }
    if (!data.user) throw new Error("auth user was not created");
    return data.user.id;
  }

  async deleteUser(userId: string) {
    const { error } = await this.supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}
