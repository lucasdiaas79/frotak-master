import type { AddressProbe } from "@/modules/tenants/application/client-admin";
import type { AddressStatus } from "@/modules/tenants/domain/client-admin";

// Roda no servidor do Master, a mesma VPS que atende os endereços: o que ele vê é o que o cliente vê.
// Os módulos de Node entram por import dinâmico para nunca chegarem ao pacote do navegador.

async function resolveDns(host: string) {
  const dns = await import("node:dns/promises");
  const addresses = await dns.resolve4(host).catch(() => [] as string[]);
  const cname = await dns.resolveCname(host).catch(() => [] as string[]);
  return { addresses, cname };
}

async function readCertificate(host: string) {
  const tls = await import("node:tls");
  return new Promise<{ authorized: boolean; expiresAt: number | null; error: string }>(
    (resolve) => {
      const socket = tls.connect({ host, port: 443, servername: host, timeout: 30_000 }, () => {
        const certificate = socket.getPeerCertificate();
        const expiresAt = certificate?.valid_to ? Date.parse(certificate.valid_to) / 1000 : null;
        resolve({
          authorized: socket.authorized,
          expiresAt,
          error: socket.authorized
            ? ""
            : String(socket.authorizationError ?? "certificado inválido"),
        });
        socket.end();
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve({ authorized: false, expiresAt: null, error: "sem resposta em 30 s" });
      });
      socket.on("error", (error) =>
        resolve({ authorized: false, expiresAt: null, error: error.message }),
      );
    },
  );
}

export class NodeAddressProbe implements AddressProbe {
  async check(
    host: string,
    kind: AddressStatus["kind"],
    expectedIp: string,
  ): Promise<AddressStatus> {
    const { addresses, cname } = await resolveDns(host);
    const pointsHere = expectedIp ? addresses.includes(expectedIp) : addresses.length > 0;
    const dns = {
      ok: pointsHere,
      addresses,
      detail: !addresses.length
        ? "O endereço ainda não existe no DNS"
        : pointsHere
          ? `Aponta para ${addresses.join(", ")}${cname.length ? ` (via ${cname.join(", ")})` : ""}`
          : `Aponta para ${addresses.join(", ")}, e não para ${expectedIp}`,
    };
    if (!pointsHere) {
      return {
        host,
        kind,
        dns,
        https: { ok: false, expiresAt: null, detail: "Espera o DNS apontar" },
        app: { ok: false, detail: "Espera o DNS apontar" },
      };
    }

    // A primeira conexão faz o Caddy emitir o certificado; pode levar alguns segundos.
    const certificate = await readCertificate(host);
    const https = {
      ok: certificate.authorized,
      expiresAt: certificate.expiresAt,
      detail: certificate.authorized
        ? "Certificado válido"
        : `Ainda sem certificado válido: ${certificate.error}`,
    };
    let app = { ok: false, detail: "Espera o HTTPS" };
    if (certificate.authorized) {
      try {
        const response = await fetch(`https://${host}/frotak-client.js`, {
          signal: AbortSignal.timeout(20_000),
          redirect: "manual",
        });
        app =
          response.status === 200
            ? { ok: true, detail: "O TMS abre o banco deste cliente" }
            : { ok: false, detail: `O TMS respondeu ${response.status}` };
      } catch (error) {
        app = { ok: false, detail: `Sem resposta do TMS: ${String(error).slice(0, 80)}` };
      }
    }
    return { host, kind, dns, https, app };
  }
}
