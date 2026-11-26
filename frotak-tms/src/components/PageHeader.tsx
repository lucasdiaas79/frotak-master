import * as React from "react";
import { FrotakPageHeader } from "@/components/frotak/FrotakPage";

interface Props {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: Props) {
  return (
    <FrotakPageHeader
      title={title}
      description={subtitle}
      actions={actions}
      className={className}
    />
  );
}
