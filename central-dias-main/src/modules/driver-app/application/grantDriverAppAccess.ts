import { buildDriverLogin } from "@/modules/driver-app/domain/driverAccess";
import type {
  DriverAccessRepository,
  DriverIdentityProvider,
} from "@/modules/driver-app/application/ports";

export type GrantDriverAppAccessInput = {
  accessToken: string;
  driverId: string;
  phone: string;
};

/**
 * Cria ou redefine o login do motorista no app. So o dono do tenant pode fazer isso,
 * e o modulo App Motorista precisa estar liberado pelo FrotaK Master.
 */
export async function grantDriverAppAccess(
  deps: { identity: DriverIdentityProvider; drivers: DriverAccessRepository },
  input: GrantDriverAppAccessInput,
) {
  const actorUserId = await deps.identity.resolveUserId(input.accessToken);
  if (!actorUserId) throw new Error("Usuario nao autenticado.");

  const driver = await deps.drivers.findDriver(input.driverId);
  if (!driver) throw new Error("Motorista nao encontrado.");

  const workspaceId = await deps.drivers.findOwnedWorkspace(actorUserId, driver.tenantId);
  if (!workspaceId) throw new Error("Apenas o owner do tenant pode criar acesso de motorista.");

  if (!(await deps.drivers.hasDriverAppModule(workspaceId))) {
    throw new Error("O App Motorista nao esta liberado para a sua empresa. Fale com a FrotaK.");
  }

  const login = buildDriverLogin(driver, input.phone);
  const existingUserId = driver.authUserId ?? (await deps.identity.findLogin(login));
  let authUserId: string;
  if (existingUserId) {
    authUserId = existingUserId;
    await deps.identity.resetLogin(authUserId, login);
  } else {
    authUserId = await deps.identity.createLogin(login);
  }

  await deps.drivers.saveDriverProfile(authUserId, login);
  await deps.drivers.linkDriverLogin(driver.id, authUserId, login.phone);
  await deps.drivers.recordAccessGranted({
    actorUserId,
    tenantId: driver.tenantId,
    driverId: driver.id,
    authUserId,
  });

  return { driverId: driver.id, authUserId };
}
