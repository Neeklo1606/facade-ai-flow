import {
  BookOpen,
  Building2,
  ClipboardCheck,
  Coins,
  FileSpreadsheet,
  Home,
  IdCard,
  LayoutDashboard,
  MessageCircleQuestion,
  MessagesSquare,
  ScrollText,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { GasScreenKey } from "@/lib/gas-ops/screens";

export const SCREEN_ICON: Record<GasScreenKey, LucideIcon> = {
  start: Home,
  foreman: MessagesSquare,
  moderation: ClipboardCheck,
  entries: ScrollText,
  reports: FileSpreadsheet,
  brigades: Users,
  objects: Building2,
  estimates: Coins,
  employees: IdCard,
  summary: LayoutDashboard,
  admin: Settings2,
  guide: BookOpen,
  questions: MessageCircleQuestion,
};
