import { LayoutGrid } from "lucide-react";
import { PlaceholderPage, placeholderMetadata } from "@/components/placeholder-page";

export const generateMetadata = () => placeholderMetadata("Compare");

export default function ComparePage() {
  return <PlaceholderPage section="Compare" icon={LayoutGrid} />;
}
