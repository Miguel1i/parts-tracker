"use client";

import { useTranslations } from "next-intl";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setSignupMode } from "./actions";

const modes = ["open", "approval", "invite_only"] as const;
type Mode = (typeof modes)[number];

export function SignupModeSelect({ mode }: { mode: Mode }) {
  const t = useTranslations("Admin.users.signup");
  const { pending, run } = useAdminAction();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t(`help.${mode}`)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        <Label htmlFor="signup-mode">{t("label")}</Label>
        <Select
          value={mode}
          disabled={pending}
          onValueChange={(value) =>
            run(() => setSignupMode({ mode: value as Mode }), { success: t("saved") })
          }
        >
          <SelectTrigger id="signup-mode" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modes.map((m) => (
              <SelectItem key={m} value={m}>
                {t(`modes.${m}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
