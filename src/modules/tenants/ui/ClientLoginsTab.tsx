import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { StatusPill, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { canOperatePanel } from "@/modules/control-panel/ui/access";
import { formatDateTime, toEpoch } from "@/modules/control-panel/ui/format";
import { Mono } from "@/modules/control-panel/ui/shared";
import { resetClientLoginPasswordFn } from "@/modules/tenants/admin-server";
import type { ClientLogin } from "@/modules/tenants/domain/client-admin";
import { CopyButton, Section } from "@/modules/tenants/ui/client-ui";

function roleOf(login: ClientLogin) {
  if (login.system) return { label: "Interno do agente", tone: "neutral" as const };
  if (login.banned) return { label: "Bloqueado", tone: "danger" as const };
  if (login.owner) return { label: "Administrador", tone: "success" as const };
  if (login.member) return { label: "Usuário", tone: "info" as const };
  return { label: "Sem acesso à empresa", tone: "warning" as const };
}

export function ClientLoginsTab({ slug, logins }: { slug: string; logins: ClientLogin[] }) {
  const canOperate = canOperatePanel();
  const [target, setTarget] = useState<ClientLogin | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ email: string; temporaryPassword: string } | null>(null);

  async function reset() {
    if (!target) return;
    setSaving(true);
    try {
      setResult(
        await resetClientLoginPasswordFn({
          data: { slug, userId: target.id, email: target.email },
        }),
      );
      setTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title={`Logins do TMS (${logins.filter((login) => !login.system).length})`}
      description="Quem entra no TMS deste cliente. Os logins ficam no banco do cliente, separados dos outros."
    >
      <TableWrap className="rounded-xl border border-border">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <Th>E-mail</Th>
              <Th>Papel</Th>
              <Th>Criado</Th>
              <Th>Último acesso</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {logins.map((login) => {
              const role = roleOf(login);
              return (
                <Tr key={login.id}>
                  <Td className="py-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-semibold break-all">{login.email}</span>
                      {login.system ? null : <CopyButton value={login.email} />}
                    </span>
                  </Td>
                  <Td className="py-2">
                    <StatusPill tone={role.tone} dot={false}>
                      {role.label}
                    </StatusPill>
                  </Td>
                  <Td className="py-2 text-xs text-muted-foreground">
                    {formatDateTime(toEpoch(login.createdAt))}
                  </Td>
                  <Td className="py-2 text-xs text-muted-foreground">
                    {login.lastSignInAt
                      ? formatDateTime(toEpoch(login.lastSignInAt))
                      : "Nunca entrou"}
                  </Td>
                  <Td className="py-2 text-right">
                    {canOperate && !login.system ? (
                      <Button size="sm" variant="outline" onClick={() => setTarget(login)}>
                        <KeyRound className="size-4" />
                        Nova senha
                      </Button>
                    ) : null}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>

      <Dialog open={Boolean(target)} onOpenChange={(open) => (open ? undefined : setTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-all">Nova senha para {target?.email}?</DialogTitle>
            <DialogDescription>
              A senha atual deixa de valer. A nova aparece uma vez só, para você enviar à pessoa. A
              ação fica na auditoria com o seu nome.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void reset()} disabled={saving}>
              {saving ? "Gerando..." : "Gerar senha temporária"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(result)} onOpenChange={(open) => (open ? undefined : setResult(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha temporária gerada</DialogTitle>
            <DialogDescription>
              Copie agora: ela não aparece de novo. Envie por um canal privado.
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-muted-foreground">Login</dt>
                <dd className="font-semibold break-all">{result.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Senha</dt>
                <dd className="inline-flex items-center gap-1">
                  <Mono className="text-base font-semibold">{result.temporaryPassword}</Mono>
                  <CopyButton value={result.temporaryPassword} />
                </dd>
              </div>
            </dl>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
