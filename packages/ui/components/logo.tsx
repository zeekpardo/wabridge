import { cn } from "../lib";

export function Logo({ withLabel = true, className }: { className?: string; withLabel?: boolean }) {
	return (
		<span className={cn("font-semibold flex items-center leading-none text-foreground", className)}>
			<img src="/logo.png" alt="WAGOAT" width={40} height={40} className="size-10 rounded-md" />
			{withLabel && <span className="ml-3 text-lg md:block hidden">WAGOAT</span>}
		</span>
	);
}
