"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Spinner } from "@repo/ui/components/spinner";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CheckIcon,
	ChevronLeftIcon,
	CopyIcon,
	LinkIcon,
	LogOutIcon,
	PlusIcon,
	RefreshCwIcon,
	UserMinusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { prettyPhone } from "../inbox/helpers";

interface GroupDetailProps {
	subaccountId?: string;
	sessionId: string;
	groupId: string;
	/**
	 * Whether our number is an admin of this group — from the list view (the only
	 * place the gateway tells us which participant is "us"). Writes are gated on it;
	 * the gateway still enforces the real permission.
	 */
	isAdmin?: boolean;
	onBack: () => void;
	/** Called after the number leaves the group (deselect + refresh the list). */
	onLeft: () => void;
}

export function GroupDetail({
	subaccountId,
	sessionId,
	groupId,
	isAdmin = false,
	onBack,
	onLeft,
}: GroupDetailProps) {
	const queryClient = useQueryClient();

	const groupQuery = useQuery({
		...orpc.whatsapp.getGroup.queryOptions({ input: { sessionId, groupId, subaccountId } }),
		refetchInterval: 20000,
	});

	const group = groupQuery.data;

	const [subject, setSubject] = useState("");
	const [description, setDescription] = useState("");
	const [newMember, setNewMember] = useState("");
	// Numbers WhatsApp wouldn't add directly (privacy) — offered an invite link instead.
	const [pendingInvite, setPendingInvite] = useState<string[]>([]);

	// Seed the editable fields whenever the group loads/changes.
	useEffect(() => {
		if (group) {
			setSubject(group.name ?? "");
			setDescription(group.description ?? "");
		}
	}, [group]);

	function invalidateGroup() {
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.getGroup.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.listGroups.key() });
	}

	const inviteQuery = useQuery({
		...orpc.whatsapp.getGroupInviteCode.queryOptions({
			input: { sessionId, groupId, subaccountId },
		}),
		enabled: false,
	});

	const setSubjectMutation = useMutation(
		orpc.whatsapp.setGroupSubject.mutationOptions({
			onSuccess: () => {
				toastSuccess("Group name updated");
				invalidateGroup();
			},
			onError: (error) => toastError(error.message ?? "Could not update the name"),
		}),
	);
	const setDescriptionMutation = useMutation(
		orpc.whatsapp.setGroupDescription.mutationOptions({
			onSuccess: () => {
				toastSuccess("Description updated");
				invalidateGroup();
			},
			onError: (error) => toastError(error.message ?? "Could not update the description"),
		}),
	);
	const addMutation = useMutation(
		orpc.whatsapp.addGroupParticipants.mutationOptions({
			onSuccess: (data) => {
				setNewMember("");
				if (data.notAdded && data.notAdded.length > 0) {
					// WhatsApp wouldn't add them directly — surface an invite-link offer instead.
					setPendingInvite((prev) => [...new Set([...prev, ...data.notAdded])]);
				} else {
					toastSuccess("Member added");
				}
				invalidateGroup();
			},
			onError: (error) => toastError(error.message ?? "Could not add the member"),
		}),
	);
	const inviteMutation = useMutation(
		orpc.whatsapp.inviteToGroup.mutationOptions({
			onSuccess: (data) => {
				toastSuccess(
					data.sent > 0 ? `Invite link sent to ${data.sent}` : "Could not send the invite link",
				);
				setPendingInvite([]);
			},
			onError: (error) => toastError(error.message ?? "Could not send the invite link"),
		}),
	);
	const removeMutation = useMutation(
		orpc.whatsapp.removeGroupParticipants.mutationOptions({
			onSuccess: () => {
				toastSuccess("Member removed");
				invalidateGroup();
			},
			onError: (error) => toastError(error.message ?? "Could not remove the member"),
		}),
	);
	const promoteMutation = useMutation(
		orpc.whatsapp.promoteGroupParticipants.mutationOptions({
			onSuccess: () => {
				toastSuccess("Member promoted to admin");
				invalidateGroup();
			},
			onError: (error) => toastError(error.message ?? "Could not promote the member"),
		}),
	);
	const demoteMutation = useMutation(
		orpc.whatsapp.demoteGroupParticipants.mutationOptions({
			onSuccess: () => {
				toastSuccess("Admin demoted");
				invalidateGroup();
			},
			onError: (error) => toastError(error.message ?? "Could not demote the member"),
		}),
	);
	const revokeMutation = useMutation(
		orpc.whatsapp.revokeGroupInviteCode.mutationOptions({
			onSuccess: (data) => {
				toastSuccess("Invite link reset");
				queryClient.setQueryData(
					orpc.whatsapp.getGroupInviteCode.queryKey({
						input: { sessionId, groupId, subaccountId },
					}),
					data,
				);
			},
			onError: (error) => toastError(error.message ?? "Could not reset the invite link"),
		}),
	);
	const leaveMutation = useMutation(
		orpc.whatsapp.leaveGroup.mutationOptions({
			onSuccess: () => {
				toastSuccess("Left the group");
				onLeft();
			},
			onError: (error) => toastError(error.message ?? "Could not leave the group"),
		}),
	);

	const inviteLink = inviteQuery.data?.inviteLink ?? null;

	function copyInvite() {
		if (!inviteLink) {
			return;
		}
		void navigator.clipboard.writeText(inviteLink);
		toastSuccess("Invite link copied");
	}

	if (groupQuery.isLoading) {
		return (
			<div className="py-16 flex flex-1 items-center justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}

	if (!group) {
		return (
			<div className="gap-2 p-6 flex flex-1 flex-col items-center justify-center text-center">
				<p className="font-medium">Group unavailable</p>
				<p className="text-sm text-foreground/70">
					This number may no longer be a member of the group.
				</p>
				<Button variant="secondary" size="sm" onClick={onBack}>
					Back
				</Button>
			</div>
		);
	}

	const subjectDirty = subject.trim() !== "" && subject.trim() !== (group.name ?? "");
	const descriptionDirty = description !== (group.description ?? "");

	return (
		<div className="min-h-0 flex flex-1 flex-col overflow-y-auto">
			<div className="gap-2 p-3 flex items-center border-b">
				<Button
					variant="ghost"
					size="icon"
					className="md:hidden"
					aria-label="Back to groups"
					onClick={onBack}
				>
					<ChevronLeftIcon className="size-4" />
				</Button>
				<div className="min-w-0 flex-1">
					<p className="font-medium text-sm truncate">{group.name || "Unnamed group"}</p>
					<p className="text-xs text-foreground/60">
						{group.participants.length} member{group.participants.length === 1 ? "" : "s"}
						{isAdmin ? " · You're an admin" : ""}
					</p>
				</div>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="ghost" size="sm" className="gap-1.5 text-rose-500">
							<LogOutIcon className="size-4" />
							Leave
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Leave this group?</AlertDialogTitle>
							<AlertDialogDescription>
								This number will leave “{group.name || "the group"}”. You can only rejoin with a new
								invite.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={() => leaveMutation.mutate({ sessionId, groupId, subaccountId })}
							>
								Leave group
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>

			<div className="gap-6 p-4 flex flex-col">
				{/* Subject + description */}
				<section className="gap-3 flex flex-col">
					<div className="gap-1.5 flex flex-col">
						<span className="text-xs font-medium text-foreground/70">Group name</span>
						<div className="gap-2 flex items-center">
							<Input
								value={subject}
								disabled={!isAdmin || setSubjectMutation.isPending}
								onChange={(event) => setSubject(event.target.value)}
								placeholder="Group name"
							/>
							<Button
								size="sm"
								disabled={!isAdmin || !subjectDirty}
								loading={setSubjectMutation.isPending}
								onClick={() =>
									setSubjectMutation.mutate({
										sessionId,
										groupId,
										subject: subject.trim(),
										subaccountId,
									})
								}
							>
								Save
							</Button>
						</div>
					</div>

					<div className="gap-1.5 flex flex-col">
						<span className="text-xs font-medium text-foreground/70">Description</span>
						<Textarea
							value={description}
							disabled={!isAdmin || setDescriptionMutation.isPending}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="Add a description"
							rows={3}
						/>
						<div className="flex justify-end">
							<Button
								size="sm"
								variant="secondary"
								disabled={!isAdmin || !descriptionDirty}
								loading={setDescriptionMutation.isPending}
								onClick={() =>
									setDescriptionMutation.mutate({
										sessionId,
										groupId,
										description,
										subaccountId,
									})
								}
							>
								Save description
							</Button>
						</div>
					</div>
				</section>

				{/* Invite link */}
				<section className="gap-2 flex flex-col">
					<span className="text-xs font-medium text-foreground/70">Invite link</span>
					{inviteLink ? (
						<div className="gap-2 flex flex-wrap items-center">
							<code className="min-w-0 px-2.5 py-1.5 text-xs flex-1 truncate rounded-md border bg-muted/40">
								{inviteLink}
							</code>
							<Button variant="secondary" size="sm" className="gap-1.5" onClick={copyInvite}>
								<CopyIcon className="size-3.5" />
								Copy
							</Button>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="gap-1.5"
										disabled={!isAdmin || revokeMutation.isPending}
									>
										<RefreshCwIcon className="size-3.5" />
										Revoke
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Reset the invite link?</AlertDialogTitle>
										<AlertDialogDescription>
											The current link stops working immediately and a new one is generated.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											onClick={() => revokeMutation.mutate({ sessionId, groupId, subaccountId })}
										>
											Reset link
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					) : (
						<Button
							variant="secondary"
							size="sm"
							className="gap-1.5 self-start"
							loading={inviteQuery.isFetching}
							onClick={() => void inviteQuery.refetch()}
						>
							<LinkIcon className="size-3.5" />
							Show invite link
						</Button>
					)}
				</section>

				{/* Members */}
				<section className="gap-2 flex flex-col">
					<span className="text-xs font-medium text-foreground/70">
						Members ({group.participants.length})
					</span>

					{isAdmin ? (
						<div className="gap-2 flex items-center">
							<Input
								value={newMember}
								onChange={(event) => setNewMember(event.target.value)}
								placeholder="Add by phone number, e.g. +15551234567"
								onKeyDown={(event) => {
									if (event.key === "Enter" && newMember.trim()) {
										addMutation.mutate({
											sessionId,
											groupId,
											participants: [newMember.trim()],
											subaccountId,
										});
									}
								}}
							/>
							<Button
								size="sm"
								className="gap-1.5"
								disabled={!newMember.trim()}
								loading={addMutation.isPending}
								onClick={() =>
									addMutation.mutate({
										sessionId,
										groupId,
										participants: [newMember.trim()],
										subaccountId,
									})
								}
							>
								<PlusIcon className="size-3.5" />
								Add
							</Button>
						</div>
					) : null}

					{isAdmin && pendingInvite.length > 0 ? (
						<div className="gap-2 p-3 border-amber-500/40 bg-amber-500/10 flex flex-col rounded-md border">
							<p className="text-xs text-foreground/80">
								WhatsApp couldn't add{" "}
								<span className="font-medium">
									{pendingInvite.map((n) => prettyPhone(n)).join(", ")}
								</span>{" "}
								directly — their privacy settings require an invite. Send them the group's invite
								link so they can join.
							</p>
							<div className="gap-2 flex items-center">
								<Button
									size="sm"
									className="gap-1.5"
									loading={inviteMutation.isPending}
									onClick={() =>
										inviteMutation.mutate({
											sessionId,
											groupId,
											phones: pendingInvite,
											subaccountId,
										})
									}
								>
									<LinkIcon className="size-3.5" />
									Send invite link
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={inviteMutation.isPending}
									onClick={() => setPendingInvite([])}
								>
									Dismiss
								</Button>
							</div>
						</div>
					) : null}

					<div className="flex flex-col rounded-md border">
						{group.participants.map((participant) => {
							const name = participant.name?.trim() || prettyPhone(participant.id);
							const phone = participant.number ? prettyPhone(participant.number) : null;
							return (
								<div
									key={participant.id}
									className="gap-2 px-3 py-2 flex items-center border-b last:border-b-0"
								>
									<div className="min-w-0 flex-1">
										<div className="gap-1.5 flex items-center">
											<p className="text-sm truncate">{name}</p>
											{participant.isSuperAdmin ? (
												<Badge status="success" className="px-2 py-0.5 normal-case">
													Owner
												</Badge>
											) : participant.isAdmin ? (
												<Badge status="info" className="px-2 py-0.5 normal-case">
													Admin
												</Badge>
											) : null}
										</div>
										{phone && phone !== name ? (
											<p className="text-xs truncate text-foreground/60">{phone}</p>
										) : null}
									</div>

									{isAdmin && !participant.isSuperAdmin ? (
										<div className="gap-1 flex items-center">
											{participant.isAdmin ? (
												<Button
													variant="ghost"
													size="icon"
													aria-label="Demote to member"
													title="Demote to member"
													onClick={() =>
														demoteMutation.mutate({
															sessionId,
															groupId,
															participants: [participant.id],
															subaccountId,
														})
													}
												>
													<ArrowDownIcon className="size-4" />
												</Button>
											) : (
												<Button
													variant="ghost"
													size="icon"
													aria-label="Promote to admin"
													title="Promote to admin"
													onClick={() =>
														promoteMutation.mutate({
															sessionId,
															groupId,
															participants: [participant.id],
															subaccountId,
														})
													}
												>
													<ArrowUpIcon className="size-4" />
												</Button>
											)}
											<Button
												variant="ghost"
												size="icon"
												aria-label="Remove from group"
												title="Remove from group"
												className="text-rose-500"
												onClick={() =>
													removeMutation.mutate({
														sessionId,
														groupId,
														participants: [participant.id],
														subaccountId,
													})
												}
											>
												<UserMinusIcon className="size-4" />
											</Button>
										</div>
									) : null}
								</div>
							);
						})}
					</div>

					{!isAdmin ? (
						<p className="gap-1.5 text-xs flex items-center text-foreground/60">
							<CheckIcon className="size-3.5" />
							You're a member — only admins can change the group.
						</p>
					) : null}
				</section>
			</div>
		</div>
	);
}
