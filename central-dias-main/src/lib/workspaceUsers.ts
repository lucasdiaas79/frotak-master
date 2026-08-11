import { createServerFn } from "@tanstack/react-start";
import {
  createWorkspaceUserData,
  getWorkspaceUserAccessData,
  getWorkspaceUsersServerDiagnosticsSnapshot,
  listWorkspaceRolesData,
  listWorkspaceUsersData,
} from "./workspaceUsers.server";

export type WorkspaceUserAccess = {
  isOwner: boolean;
  userId: string;
  workspaceId: string;
  tenantId: string;
  workspaceName: string;
  tenantName: string;
};

export type WorkspaceUser = {
  name: string;
  email: string;
  phone: string;
  sector: string;
  status: "active" | "invited" | "suspended" | "revoked";
  isOwner: boolean;
  roles: WorkspaceRole[];
  createdAt: string;
};

export type WorkspaceRole = {
  code: string;
  name: string;
};

export type CreateWorkspaceUserInput = {
  accessToken: string;
  name: string;
  email: string;
  phone: string;
  sector: string;
  roleCode: string;
  temporaryPassword: string;
};

export const getWorkspaceUsersServerDiagnostics = createServerFn({ method: "GET" }).handler(
  async () => getWorkspaceUsersServerDiagnosticsSnapshot(),
);

export const getWorkspaceUserAccess = createServerFn({ method: "POST" })
  .validator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    return getWorkspaceUserAccessData(data.accessToken);
  });

export const listWorkspaceUsers = createServerFn({ method: "POST" })
  .validator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    return listWorkspaceUsersData(data.accessToken);
  });

export const listWorkspaceRoles = createServerFn({ method: "POST" })
  .validator((input: { accessToken: string }) => input)
  .handler(async ({ data }) => {
    return listWorkspaceRolesData(data.accessToken);
  });

export const createWorkspaceUser = createServerFn({ method: "POST" })
  .validator((input: CreateWorkspaceUserInput) => input)
  .handler(async ({ data }) => {
    return createWorkspaceUserData(data);
  });
