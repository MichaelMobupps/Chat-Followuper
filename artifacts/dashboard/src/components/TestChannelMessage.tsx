import { useEffect, useState } from "react";
import { ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  postTestChannelLink,
  type TestChannel,
} from "@/lib/api/test-channel";

const DEFAULT_MESSAGE = "Test message from Chat Followuper.";

const STORAGE_KEY: Record<TestChannel, string> = {
  whatsapp: "cf-test-whatsapp-id",
  telegram: "cf-test-telegram-id",
};

interface Props {
  /** Compact layout for sidebar-style placement */
  compact?: boolean;
}

export function TestChannelMessage({ compact = false }: Props) {
  const { toast } = useToast();
  const [channel, setChannel] = useState<TestChannel>("whatsapp");
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY[channel]);
    if (saved) setIdentifier(saved);
  }, [channel]);

  const test = useMutation({
    mutationFn: postTestChannelLink,
    onSuccess: (data) => {
      localStorage.setItem(STORAGE_KEY[channel], identifier.trim());
      window.open(data.deepLinkUrl, "_blank", "noopener,noreferrer");
      toast({
        title: `Opening ${channel === "whatsapp" ? "WhatsApp" : "Telegram"}`,
        description: `Message prefilled in the chat box — press send in the app to deliver to ${data.target}.`,
      });
    },
    onError: (err: ApiError) => {
      toast({
        title: "Could not open test chat",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  function handleOpenTestChat() {
    const id = identifier.trim();
    if (!id) return;
    test.mutate({ channel, identifier: id, message: message.trim() });
  }

  return (
    <Card className={compact ? "border-dashed" : undefined}>
      <CardContent className={compact ? "space-y-4 p-4" : "space-y-5 p-6"}>
        <div className="space-y-1">
          <h2
            className={`flex items-center gap-2 font-medium ${compact ? "text-sm" : "text-base"}`}
          >
            <MessageCircle className="h-4 w-4" />
            Test {channel === "whatsapp" ? "WhatsApp" : "Telegram"} send path
          </h2>
          <p className="text-xs text-muted-foreground">
            Enter your own number or handle. Opens the chat with your message
            already in the compose box — no copy-paste. Press send in the app to
            confirm delivery works.
          </p>
        </div>

        <Tabs
          value={channel}
          onValueChange={(v) => setChannel(v as TestChannel)}
        >
          <TabsList className="h-8">
            <TabsTrigger value="whatsapp" className="text-xs px-3">
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="telegram" className="text-xs px-3">
              Telegram
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="test-channel-id">
            {channel === "whatsapp"
              ? "Your WhatsApp number"
              : "Your phone or @handle"}
          </Label>
          <Input
            id="test-channel-id"
            placeholder={
              channel === "whatsapp" ? "+972501234567" : "+972501234567 or @you"
            }
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            data-testid="test-channel-identifier"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="test-channel-message">Message</Label>
          <Textarea
            id="test-channel-message"
            rows={compact ? 2 : 3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            data-testid="test-channel-message"
          />
        </div>

        <Button
          onClick={handleOpenTestChat}
          disabled={!identifier.trim() || test.isPending}
          size={compact ? "sm" : "default"}
          data-testid="test-channel-open"
        >
          {test.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-1" />
          )}
          Open test chat
        </Button>
      </CardContent>
    </Card>
  );
}