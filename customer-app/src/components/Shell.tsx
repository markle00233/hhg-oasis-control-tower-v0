import { BottomNav } from "./BottomNav";
import { MembershipThemeBoot } from "./MembershipTheme";

export function Shell({
  children,
  showNav = true,
}: {
  children: React.ReactNode;
  showNav?: boolean;
}) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-32 pt-6">
      <MembershipThemeBoot />
      {children}
      {showNav ? <BottomNav /> : null}
    </div>
  );
}
