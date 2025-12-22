export interface ToolboxNavItem {
  label: string;
  href: string;
  key: string;
}

export const toolboxNav: ToolboxNavItem[] = [
  { label: 'Home', href: '/toolbox', key: 'home' },
  { label: 'Yarn Control', href: '/toolbox/yarn', key: 'yarn' },
  { label: 'Base Fabric', href: '/toolbox/base-fabric', key: 'base-fabric' },
  { label: 'Dyes & Chemicals', href: '/toolbox/dyes', key: 'dyes' },
  { label: 'Finished Fabric Control', href: '/toolbox/finished-fabric', key: 'finished-fabric' },
  { label: 'Stock Control', href: '/toolbox/stock', key: 'stock' },
  { label: 'Orders & Dispatch', href: '/toolbox/orders', key: 'orders' },
];

