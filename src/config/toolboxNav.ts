export interface ToolboxNavItem {
  label: string;
  href: string;
  key: string;
}

export const toolboxNav: ToolboxNavItem[] = [
  { label: "Home", href: "/toolbox", key: "home" },
  { label: "Yarn Control", href: "/toolbox/yarn", key: "yarn" },
  { label: "Dyes & Chemicals", href: "/toolbox/dyes", key: "dyes" },
  { label: "Base Fabric", href: "/toolbox/base-fabric", key: "base-fabric" },
  { label: "Finished Fabric Control", href: "/toolbox/finished-fabric", key: "finished-fabric" },
];

