"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { useState } from "react";

import { CommandBuilder } from "./CommandBuilder";
import { GroupsView } from "./groups/GroupsView";
import { ConnectionBanner } from "./inbox/ConnectionBanner";
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
	// Which tab is active — lifted so the inbox's "Manage" shortcut can switch to
	// the Groups tab with a specific group pre-selected.
	const [tab, setTab] = useState("inbox");
	// The group chatId the Manage shortcut wants opened; consumed by GroupsView as
	// its initial selection, then cleared once handed off.
	const [selectedGroupChatId, setSelectedGroupChatId] = useState<string | null>(null);

	function manageGroup(chatId: string) {
		setSelectedGroupChatId(chatId);
		setTab("groups");
	}

	// Embedded (GHL Custom Page): full-height, chrome-less. The tab bar is fixed
	// and the active pane fills the rest of the iframe.
	if (embedded) {
		return (
			<Tabs value={tab} onValueChange={setTab} className="gap-0 flex h-full flex-col">
				<ConnectionBanner subaccountId={subaccountId} />
				<TabsList className="px-2 shrink-0 justify-start rounded-none border-b bg-card">
					<TabsTrigger value="inbox">Inbox</TabsTrigger>
					<TabsTrigger value="groups">Groups</TabsTrigger>
					<TabsTrigger value="numbers">Connections</TabsTrigger>
					<TabsTrigger value="builder">Builder</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
				</TabsList>
				<TabsContent value="inbox" className="m-0 min-h-0 flex-1 overflow-hidden">
					<WhatsAppInbox embedded subaccountId={subaccountId} onManageGroup={manageGroup} />
				</TabsContent>
				<TabsContent value="groups" className="m-0 min-h-0 flex-1 overflow-hidden">
					<GroupsView
						subaccountId={subaccountId}
						embedded
						initialGroupId={selectedGroupChatId}
						onInitialGroupConsumed={() => setSelectedGroupChatId(null)}
					/>
				</TabsContent>
				<TabsContent value="numbers" className="m-0 min-h-0 p-4 flex-1 overflow-y-auto">
					<WhatsAppNumbers subaccountId={subaccountId} />
				</TabsContent>
				<TabsContent value="builder" className="m-0 min-h-0 p-4 flex-1 overflow-y-auto">
					<CommandBuilder subaccountId={subaccountId} />
				</TabsContent>
				<TabsContent value="settings" className="m-0 min-h-0 p-4 flex-1 overflow-y-auto">
					<SubaccountSettings subaccountId={subaccountId} />
				</TabsContent>
			</Tabs>
		);
	}

	return (
		<Tabs value={tab} onValueChange={setTab}>
			<TabsList>
				<TabsTrigger value="inbox">Inbox</TabsTrigger>
				<TabsTrigger value="groups">Groups</TabsTrigger>
				<TabsTrigger value="numbers">Connections</TabsTrigger>
				<TabsTrigger value="builder">Builder</TabsTrigger>
				<TabsTrigger value="settings">Settings</TabsTrigger>
			</TabsList>
			<TabsContent value="inbox" className="mt-4">
				<WhatsAppInbox subaccountId={subaccountId} onManageGroup={manageGroup} />
			</TabsContent>
			<TabsContent value="groups" className="mt-4">
				<GroupsView
					subaccountId={subaccountId}
					initialGroupId={selectedGroupChatId}
					onInitialGroupConsumed={() => setSelectedGroupChatId(null)}
				/>
			</TabsContent>
			<TabsContent value="numbers" className="mt-4">
				<WhatsAppNumbers subaccountId={subaccountId} />
			</TabsContent>
			<TabsContent value="builder" className="mt-4">
				<CommandBuilder subaccountId={subaccountId} />
			</TabsContent>
			<TabsContent value="settings" className="mt-4">
				<SubaccountSettings subaccountId={subaccountId} />
			</TabsContent>
		</Tabs>
	);
}
