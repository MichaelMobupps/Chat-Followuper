import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { CampaignForm } from "@/components/campaigns/CampaignForm";
import {
  useCampaigns,
  useCreateCampaign,
  useArchiveCampaign,
  useUnarchiveCampaign,
} from "@/hooks/use-campaigns";
import type { CreateCampaignInput } from "@/lib/api/campaigns";

export default function CampaignsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<"active" | "all">("active");

  const includeArchived = tab === "all";
  const { data: campaigns, isLoading, error } = useCampaigns({ includeArchived });

  const createMutation = useCreateCampaign();
  const archiveMutation = useArchiveCampaign();
  const unarchiveMutation = useUnarchiveCampaign();

  async function handleCreate(input: CreateCampaignInput) {
    try {
      await createMutation.mutateAsync(input);
      setCreateOpen(false);
      toast({ title: "Campaign created" });
    } catch (err) {
      toast({
        title: "Could not create campaign",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  function handleArchive(id: string) {
    archiveMutation.mutate(id, {
      onSuccess: () => toast({ title: "Campaign archived" }),
      onError: (err) =>
        toast({
          title: "Could not archive",
          description: err.message,
          variant: "destructive",
        }),
    });
  }

  function handleUnarchive(id: string) {
    unarchiveMutation.mutate(id, {
      onSuccess: () => toast({ title: "Campaign unarchived" }),
      onError: (err) =>
        toast({
          title: "Could not unarchive",
          description: err.message,
          variant: "destructive",
        }),
    });
  }

  const isMutating = archiveMutation.isPending || unarchiveMutation.isPending;

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1
            className="text-2xl font-semibold tracking-tight"
            data-testid="page-title"
          >
            Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">
            Group prospects by audience, channel, language, or vertical.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="button-new-campaign"
        >
          <Plus className="h-4 w-4 mr-2" />
          New campaign
        </Button>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "active" | "all")}
      >
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active">
            Active
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            All (incl. archived)
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {isLoading && (
            <div
              className="flex items-center justify-center py-12"
              data-testid="campaigns-loading"
            >
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              data-testid="campaigns-error"
            >
              Could not load campaigns: {error.message}
            </div>
          )}
          {!isLoading && !error && campaigns?.length === 0 && (
            <div
              className="border border-dashed border-border rounded-lg p-12 text-center bg-card"
              data-testid="campaigns-empty"
            >
              <p className="text-sm text-muted-foreground">
                {tab === "active"
                  ? "No active campaigns. Create your first to start grouping prospects."
                  : "No campaigns yet."}
              </p>
            </div>
          )}
          {!isLoading && !error && campaigns && campaigns.length > 0 && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              data-testid="campaigns-list"
            >
              {campaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onArchive={handleArchive}
                  onUnarchive={handleUnarchive}
                  isMutating={isMutating}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
          </DialogHeader>
          <CampaignForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            isSubmitting={createMutation.isPending}
            submitLabel="Create"
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
