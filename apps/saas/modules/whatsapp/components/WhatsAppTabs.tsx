"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { SubaccountSettings } from "./SubaccountSettings";
import { WhatsAppNumbers } from "./WhatsAppNumbers";
import { WhatsAppInbox } from "./inbox/WhatsAppInbox";

export function WhatsAppTabs({
	subaccountId,
	embedded = false,
}: {
	subaccountId?: string;
	embedded?: boolean;
}) {
	// Embedded (GHL Custom Page): full-height, chrome-less. The tab bar is fixed
	// and the active pane fills the rest of the iframe.
	if (embedded) {
		return (
			<Tabs defaultValue="inbox" className="flex h-full flex-col gap-0">
				<TabsList className="shrink-0 justify-start rounded-none border-b bg-card px-2">
					<TabsTrigger value="inbox">Inbox</TabsTrigger>
					<TabsTrigger value="numbers">Connections</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
				</TabsList>
				<TabsContent value="inbox" className="m-0 min-h-0 flex-1 overflow-hidden">
					<WhatsAppInbox embedded subaccountId={subaccountId} />
				</TabsContent>
				<TabsContent value="numbers" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
					<WhatsAppNumbers subaccountId={subaccountId} />
				</TabsContent>
				<TabsContent value="settings" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
					<SubaccountSettings subaccountId={subaccountId} />
				</TabsContent>
			</Tabs>
		);
	}

	return (
		<Tabs defaultValue="inbox">
			<TabsList>
				<TabsTrigger value="inbox">Inbox</TabsTrigger>
				<TabsTrigger value="numbers">Connections</TabsTrigger>
				<TabsTrigger value="settings">Settings</TabsTrigger>
			</TabsList>
			<TabsContent value="inbox" className="mt-4">
				<WhatsAppInbox subaccountId={subaccountId} />
			</TabsContent>
			<TabsContent value="numbers" className="mt-4">
				<WhatsAppNumbers subaccountId={subaccountId} />
			</TabsContent>
			<TabsContent value="settings" className="mt-4">
				<SubaccountSettings subaccountId={subaccountId} />
			</TabsContent>
		</Tabs>
	);
}
