"use client";

import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";

export function LinkPreview({ url }: { url: string }) {
	const { data } = useQuery({
		...orpc.whatsapp.linkPreview.queryOptions({ input: { url } }),
		staleTime: 10 * 60 * 1000,
		retry: false,
	});

	if (!data) {
		return null;
	}

	return (
		<a
			href={data.url}
			target="_blank"
			rel="noopener noreferrer"
			className="mt-1.5 w-56 sm:w-64 block overflow-hidden rounded-lg border bg-card text-foreground no-underline"
		>
			{data.image ? (
				// oxlint-disable-next-line jsx-a11y/alt-text
				<img src={data.image} alt="" className="h-28 w-full bg-muted object-cover" />
			) : null}
			<div className="gap-0.5 p-2 flex flex-col">
				{data.siteName ? (
					<span className="tracking-wide truncate text-[10px] text-foreground/55 uppercase">
						{data.siteName}
					</span>
				) : null}
				{data.title ? <span className="font-medium text-xs line-clamp-2">{data.title}</span> : null}
				{data.description ? (
					<span className="line-clamp-2 text-[11px] text-foreground/75">{data.description}</span>
				) : null}
			</div>
		</a>
	);
}
