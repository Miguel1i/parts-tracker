"use client";

import { Copy, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useServerAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resetShareLink, setBuildPublic } from "./actions";

export function SharePanel({
  buildId,
  isPublic,
  shareToken,
}: {
  buildId: string;
  isPublic: boolean;
  shareToken: string | null;
}) {
  const t = useTranslations("Builds.share");
  const { pending, run } = useServerAction();
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const link = isPublic && shareToken ? `${origin}/share/${shareToken}` : null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("copied"));
    } catch {
      // Clipboard blocked: the link stays selectable in the field.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="build-public"
            checked={isPublic}
            disabled={pending}
            onCheckedChange={(checked) => run(() => setBuildPublic({ buildId, isPublic: checked }))}
          />
          <Label htmlFor="build-public">{t("public")}</Label>
        </div>
        {link && (
          <div className="grid gap-1.5">
            <Label htmlFor="share-link">{t("link")}</Label>
            <div className="flex gap-2">
              <Input
                id="share-link"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="outline" size="icon" aria-label={t("copy")} onClick={copy}>
                <Copy className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("reset")}
                disabled={pending}
                onClick={() => run(() => resetShareLink({ buildId }), { success: t("resetDone") })}
              >
                <RotateCw className="size-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t("resetHint")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
