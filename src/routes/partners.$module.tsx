import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceVisualPage } from "@/components/workspaces/WorkspaceVisualPage";
import { getWorkspaceByKey } from "@/lib/workspaces";

export const Route = createFileRoute("/partners/$module")({
  component: PartnersModule,
});

function PartnersModule() {
  const { module } = Route.useParams();
  return <WorkspaceVisualPage workspace={getWorkspaceByKey("partners")} moduleSlug={module} />;
}
