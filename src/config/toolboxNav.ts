import { 
  Home, 
  Package, 
  Spool,
  FlaskConical, 
  Warehouse, 
  ClipboardList, 
  QrCode,
  LucideIcon
} from "lucide-react";

export interface ToolboxNavItem {
  label: string;
  href: string;
  key: string;
  icon: LucideIcon;
  filled?: boolean; // For filled/unfilled icon variants
  fillColor?: string; // Color for filled icons
}

export const toolboxNav: ToolboxNavItem[] = [
  { label: 'Home', href: '/toolbox', key: 'home', icon: Home },
  { label: 'Yarn Control', href: '/toolbox/yarn', key: 'yarn', icon: Spool },
  { label: 'Base Fabric', href: '/toolbox/base-fabric', key: 'base-fabric', icon: Package, filled: false },
  { label: 'Dyes & Chemicals', href: '/toolbox/dyes', key: 'dyes', icon: FlaskConical },
  { label: 'Finished Fabric Control', href: '/toolbox/finished-fabric', key: 'finished-fabric', icon: Package, filled: true, fillColor: '#0F766E' },
  { label: 'Stock Control', href: '/toolbox/stock', key: 'stock', icon: Warehouse },
  { label: 'Orders & Dispatch', href: '/toolbox/orders', key: 'orders', icon: ClipboardList },
  { label: 'QR Code Scanner', href: '/toolbox/qr', key: 'qr', icon: QrCode },
];

