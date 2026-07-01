import { AdminWhatsAppSessions } from "@admin/component/whatsapp/AdminWhatsAppSessions";

export function generateMetadata() {
	return {
		title: "WhatsApp — Admin",
	};
}

export default function AdminWhatsAppPage() {
	return <AdminWhatsAppSessions />;
}
