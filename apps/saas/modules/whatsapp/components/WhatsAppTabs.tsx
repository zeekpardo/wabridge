"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { WhatsAppInbox } from "./inbox/WhatsAppInbox";
import { WhatsAppNumbers } from "./WhatsAppNumbers";

export function WhatsAppTabs() {
	return (
		<Tabs defaultValue="inbox">
			<TabsList>
				<TabsTrigger value="inbox">Inbox</TabsTrigger>
				<TabsTrigger value="numbers">Numbers</TabsTrigger>
			</TabsList>
			<TabsContent value="inbox" className="mt-4">
				<WhatsAppInbox />
			</TabsContent>
			<TabsContent value="numbers" className="mt-4">
				<WhatsAppNumbers />
			</TabsContent>
		</Tabs>
	);
}
