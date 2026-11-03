import { Shield } from "lucide-react";
import { PlaceholderPage, placeholderMetadata } from "@/components/placeholder-page";

// Not in the sidebar. In milestone 5 this moves behind a server-side role check
// (non-admins get notFound()) and is reached from the account menu, for admins only.
export async function generateMetadata() {
  return { ...(await placeholderMetadata("Admin")), robots: { index: false } };
}

export default function AdminPage() {
  return <PlaceholderPage section="Admin" icon={Shield} />;
}
