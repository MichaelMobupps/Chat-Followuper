import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Archive, ArchiveRestore } from "lucide-react";
import type { Campaign } from "@/lib/api/campaigns";

interface Props {
  campaign: Campaign;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  isMutating?: boolean;
}

export function CampaignCard({
  campaign,
  onArchive,
  onUnarchive,
  isMutating,
}: Props) {
  const isArchived = campaign.archivedAt !== null;

  return (
    <Card
      className="hover-elevate"
      data-testid={`campaign-card-${campaign.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              <Link
                href={`/campaigns/${campaign.id}`}
                className="hover:underline"
                data-testid={`link-campaign-${campaign.id}`}
              >
                {campaign.name}
              </Link>
            </CardTitle>
            {campaign.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {campaign.description}
              </p>
            )}
          </div>
          <div className="shrink-0">
            {isArchived
              ? onUnarchive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUnarchive(campaign.id)}
                    disabled={isMutating}
                    data-testid={`button-unarchive-${campaign.id}`}
                  >
                    <ArchiveRestore className="h-4 w-4 mr-1" />
                    Unarchive
                  </Button>
                )
              : onArchive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onArchive(campaign.id)}
                    disabled={isMutating}
                    data-testid={`button-archive-${campaign.id}`}
                  >
                    <Archive className="h-4 w-4 mr-1" />
                    Archive
                  </Button>
                )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
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
      </CardContent>
    </Card>
  );
}
