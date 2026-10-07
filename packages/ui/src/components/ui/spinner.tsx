import { Loading03Icon } from "@hugeicons/core-free-icons";
import { cn } from "../../lib/cn";
import { Icon, type IconSize } from "./icon";

/** Brand-violet activity indicator: Bolts or its local models are working. */
export function Spinner({ size = "sm", label = "Working", className }: { size?: IconSize; label?: string; className?: string }) {
  return (
    <span role={label ? "status" : undefined} className={cn("inline-flex text-brand-violet", className)}>
      <Icon icon={Loading03Icon} size={size} className="animate-spin" />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
