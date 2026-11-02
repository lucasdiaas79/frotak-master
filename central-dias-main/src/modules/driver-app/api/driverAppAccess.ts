import { createServerFn } from "@tanstack/react-start";
import {
  grantDriverAppAccess,
  type GrantDriverAppAccessInput,
} from "@/modules/driver-app/application/grantDriverAppAccess";
import { SupabaseDriverAccess } from "@/modules/driver-app/infrastructure/supabaseDriverAccess";
import { getSupabaseAdmin } from "../../../../server/lib/supabase-admin.ts";

export type CreateDriverAppAccessInput = GrantDriverAppAccessInput;

export const createDriverAppAccess = createServerFn({ method: "POST" })
  .inputValidator((input: CreateDriverAppAccessInput) => input)
  .handler(async ({ data }) => {
    const access = new SupabaseDriverAccess(getSupabaseAdmin());
    return grantDriverAppAccess({ identity: access, drivers: access }, data);
  });
