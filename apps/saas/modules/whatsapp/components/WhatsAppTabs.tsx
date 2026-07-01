"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { WhatsAppInbox } from "./inbox/WhatsAppInbox";
import { SubaccountSettings } from "./SubaccountSettings";
import { WhatsAppNumbers } from "./WhatsAppNumbers";

export function WhatsAppTabs({ subaccountId }: { subaccountId?: string }) {
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
