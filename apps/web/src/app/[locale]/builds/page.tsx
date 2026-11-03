import { Package } from "lucide-react";
import { PlaceholderPage, placeholderMetadata } from "@/components/placeholder-page";

export const generateMetadata = () => placeholderMetadata("Builds");

export default function BuildsPage() {
  return <PlaceholderPage section="Builds" icon={Package} />;
}
