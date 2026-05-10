import { Avatar, AvatarFallback } from "@informach/ui/components/avatar";
import { cn } from "@informach/ui/lib/utils";
import { getAvatarColorClass, getInitials } from "../utils";

type Props = {
  name: string;
  className?: string;
};

export function StudentAvatar({ name, className }: Props) {
  const initials = getInitials(name);
  const colorClass = getAvatarColorClass(name);
  return (
    <Avatar className={cn("size-12", className)}>
      <AvatarFallback className={cn(colorClass, "text-white text-sm font-semibold")}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
