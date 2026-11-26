// Regras do login do motorista no app. Puro: sem banco, sem rede.

/** Senha inicial do app motorista; o motorista troca no primeiro acesso. */
export const DRIVER_TEMPORARY_PASSWORD = "123456";

export type DriverRecord = {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  authUserId: string | null;
};

export type DriverLogin = {
  email: string;
  phone: string;
  password: string;
  fullName: string;
};

export function normalizeDriverPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}

export function driverLoginEmail(phone: string) {
  return `${phone.replace(/\D/g, "")}@driver.frotak.local`;
}

/** Login do motorista: e-mail derivado do telefone e senha inicial. */
export function buildDriverLogin(driver: DriverRecord, phoneInput: string): DriverLogin {
  const phone = normalizeDriverPhone(phoneInput || driver.phone || "");
  if (phone.length < 12) throw new Error("Telefone invalido para login do motorista.");
  return {
    email: driverLoginEmail(phone),
    phone,
    password: DRIVER_TEMPORARY_PASSWORD,
    fullName: driver.name,
  };
}
