"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useServerAction } from "@/components/admin/use-admin-action";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initials } from "@/lib/initials";
import { updateProfile } from "./actions";

export function ProfileSection({
  name: initialName,
  username: initialUsername,
  email,
}: {
  name: string;
  username: string;
  email: string;
}) {
  const t = useTranslations("Account.settings.profile");
  const { pending, run } = useServerAction();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const valid = name.trim().length > 0 && /^[a-z0-9_.]{3,30}$/i.test(username.trim());
  const dirty = name.trim() !== initialName || username.trim() !== initialUsername;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateProfile({ name, username }), { success: t("saved") });
          }}
        >
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarFallback>{initials(name || email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{name || email}</div>
              <div className="text-muted-foreground truncate text-sm">{email}</div>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-name">{t("name")}</Label>
            <Input
              id="profile-name"
              value={name}
              maxLength={100}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-username">{t("username")}</Label>
            <Input
              id="profile-username"
              value={username}
              maxLength={30}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby="profile-username-hint"
              onChange={(e) => setUsername(e.target.value)}
            />
            <p id="profile-username-hint" className="text-muted-foreground text-xs">
              {t("usernameHint")}
            </p>
          </div>
          <div>
            <Button type="submit" disabled={pending || !valid || !dirty}>
              {t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
