"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  addAdminGrantAction,
  addAdminGrantBulkAction,
  promoteAdminByEmailAction,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminResource } from "@/lib/db/types";

const RESOURCE_LABELS: Record<AdminResource, string> = { leads: "Leads", blog: "Blog" };

function useFormAction(action: (formData: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = (formData: FormData, onSuccess?: () => void) => {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(result.error ?? "That did not work.");
      }
    });
  };

  return { pending, run };
}

export function PromoteAdminForm() {
  const [email, setEmail] = React.useState("");
  const { pending, run } = useFormAction(promoteAdminByEmailAction);

  return (
    <form
      action={(formData) => run(formData, () => setEmail(""))}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="promote-email">Email of an existing account</Label>
        <Input
          id="promote-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        Make full admin
      </Button>
    </form>
  );
}

export function AddGrantForm() {
  const [email, setEmail] = React.useState("");
  const { pending, run } = useFormAction(addAdminGrantAction);

  return (
    <form
      action={(formData) => run(formData, () => setEmail(""))}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="grant-email">Email address</Label>
        <Input
          id="grant-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="grant-resource">Resource</Label>
        <Select name="resource" defaultValue="blog">
          <SelectTrigger id="grant-resource" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RESOURCE_LABELS) as AdminResource[]).map((resource) => (
              <SelectItem key={resource} value={resource}>
                {RESOURCE_LABELS[resource]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        Grant access
      </Button>
    </form>
  );
}

export function BulkGrantForm() {
  const [emails, setEmails] = React.useState("");
  const { pending, run } = useFormAction(addAdminGrantBulkAction);

  return (
    <form action={(formData) => run(formData, () => setEmails(""))} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="bulk-emails">Email addresses</Label>
        <Textarea
          id="bulk-emails"
          name="emails"
          required
          rows={4}
          value={emails}
          onChange={(event) => setEmails(event.target.value)}
          placeholder={"One per line, or comma separated\nname1@company.com\nname2@company.com"}
        />
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-resource">Resource</Label>
          <Select name="resource" defaultValue="blog">
            <SelectTrigger id="bulk-resource" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RESOURCE_LABELS) as AdminResource[]).map((resource) => (
                <SelectItem key={resource} value={resource}>
                  {RESOURCE_LABELS[resource]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Grant to all
        </Button>
      </div>
    </form>
  );
}
