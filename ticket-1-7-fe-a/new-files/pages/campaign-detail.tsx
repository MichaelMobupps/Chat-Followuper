import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  ArrowLeft,
  Loader2,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CampaignForm } from "@/components/campaigns/CampaignForm";
import {
  useCampaign,
  useUpdateCampaign,
  useArchiveCampaign,
  useUnarchiveCampaign,
  useDeleteCampaign,
} from "@/hooks/use-campaigns";
import type { UpdateCampaignInput } from "@/lib/api/campaigns";

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params.id;

  const { data: campaign, isLoading, error } = useCampaign(id);
  const updateMutation = useUpdateCampaign();
  const archiveMutation = useArchiveCampaign();
  const unarchiveMutation = useUnarchiveCampaign();
  const deleteMutation = useDeleteCampaign();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleUpdate(input: UpdateCampaignInput) {
    if (!id) return;
    try {
      await updateMutation.mutateAsync({ id, input });
      setEditOpen(false);
      toast({ title: "Campaign updated" });
    } catch (err) {
      toast({
        title: "Could not update",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  function handleArchiveToggle() {
    if (!campaign) return;
    const wasArchived = campaign.archivedAt !== null;
    const action = wasArchived ? unarchiveMutation : archiveMutation;
    action.mutate(campaign.id, {
      onSuccess: () =>
        toast({ title: wasArchived ? "Unarchived" : "Archived" }),
      onError: (err) =>
        toast({
          title: "Action failed",
          description: err.message,
          variant: "destructive",
        }),
    });
  }

  function handleDelete() {
    if (!campaign) return;
    deleteMutation.mutate(campaign.id, {
      onSuccess: () => {
        toast({ title: "Campaign deleted" });
        navigate("/campaigns");
      },
      onError: (err) =>
        toast({
          title: "Could not delete",
          description: err.message,
          variant: "destructive",
        }),
    });
  }

  if (isLoading) {
    return (
      <section
        className="flex items-center justify-center py-12"
        data-testid="campaign-detail-loading"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (error || !campaign) {
    return (
      <section className="space-y-4">
        <Link href="/campaigns" data-testid="link-back-campaigns">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to campaigns
          </Button>
        </Link>
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="campaign-detail-error"
        >
          {error?.message ?? "Campaign not found"}
        </div>
      </section>
    );
  }

  const isArchived = campaign.archivedAt !== null;
  const archiveBusy = archiveMutation.isPending || unarchiveMutation.isPending;

  return (
    <section className="space-y-6">
      <Link href="/campaigns" data-testid="link-back-campaigns">
        <Button variant="ghost" size="sm" className="px-0">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to campaigns
        </Button>
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <h1
            className="text-2xl font-semibold tracking-tight"
            data-testid="page-title"
          >
            {campaign.name}
          </h1>
          {campaign.description && (
            <p className="text-sm text-muted-foreground">
              {campaign.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {campaign.defaultChannel && (
              <Badge variant="secondary">{campaign.defaultChannel}</Badge>
            )}
            {campaign.defaultLanguage && (
              <Badge variant="outline">{campaign.defaultLanguage}</Badge>
            )}
            {campaign.defaultCountry && (
              <Badge variant="outline">{campaign.defaultCountry}</Badge>
            )}
            {campaign.defaultSubVertical && (
              <Badge variant="outline">{campaign.defaultSubVertical}</Badge>
            )}
            {isArchived && <Badge variant="destructive">Archived</Badge>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            data-testid="button-edit-campaign"
          >
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchiveToggle}
            disabled={archiveBusy}
            data-testid={isArchived ? "button-unarchive" : "button-archive"}
          >
            {isArchived ? (
              <>
                <ArchiveRestore className="h-4 w-4 mr-2" />
                Unarchive
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            data-testid="button-delete-campaign"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Prospects</dt>
              <dd
                className="text-lg font-semibold mt-0.5"
                data-testid="stat-prospect-count"
              >
                {campaign.prospectCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Created</dt>
              <dd className="mt-0.5">
                {new Date(campaign.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Updated</dt>
              <dd className="mt-0.5">
                {new Date(campaign.updatedAt).toLocaleDateString()}
              </dd>
            </div>
            {campaign.archivedAt && (
              <div>
                <dt className="text-muted-foreground text-xs">Archived</dt>
                <dd className="mt-0.5">
                  {new Date(campaign.archivedAt).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit campaign</DialogTitle>
          </DialogHeader>
          <CampaignForm
            campaign={campaign}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            isSubmitting={updateMutation.isPending}
            submitLabel="Save changes"
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              {campaign.prospectCount > 0 ? (
                <>
                  This campaign has {campaign.prospectCount} prospect
                  {campaign.prospectCount === 1 ? "" : "s"}. They will not be
                  deleted; their campaign association will be cleared.
                </>
              ) : (
                <>This action cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
