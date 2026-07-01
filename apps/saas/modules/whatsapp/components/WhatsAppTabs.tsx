"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { WhatsAppInbox } from "./inbox/WhatsAppInbox";
import { SubaccountSettings } from "./SubaccountSettings";
import { WhatsAppNumbers } from "./WhatsAppNumbers";

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
			<Tabs defaultValue="inbox" className="gap-0 flex h-full flex-col">
				<TabsList className="px-2 shrink-0 justify-start rounded-none border-b bg-card">
					<TabsTrigger value="inbox">Inbox</TabsTrigger>
					<TabsTrigger value="numbers">Connections</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
				</TabsList>
				<TabsContent value="inbox" className="m-0 min-h-0 flex-1 overflow-hidden">
					<WhatsAppInbox embedded subaccountId={subaccountId} />
				</TabsContent>
				<TabsContent value="numbers" className="m-0 min-h-0 p-4 flex-1 overflow-y-auto">
					<WhatsAppNumbers subaccountId={subaccountId} />
				</TabsContent>
				<TabsContent value="settings" className="m-0 min-h-0 p-4 flex-1 overflow-y-auto">
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
