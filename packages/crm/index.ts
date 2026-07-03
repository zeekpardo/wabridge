export type { CrmProvider } from "./lib/provider";
export {
	getConnectedCrmType,
	listCrmProviders,
	registerCrmProvider,
	resolveCrmProvider,
} from "./lib/resolve";
export type { CrmProviderRegistration } from "./lib/resolve";
export { GoHighLevelProvider } from "./lib/providers/gohighlevel";
export type { GoHighLevelConnectionRef } from "./lib/providers/gohighlevel";
export type {
	CrmContact,
	CrmFieldGroup,
	CrmMessageStatus,
	CrmOwner,
	CrmRecordedMessage,
	CrmThreadRef,
} from "./lib/types";
