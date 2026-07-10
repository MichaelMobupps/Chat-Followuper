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
  linkedin: "cf-test-linkedin-id",
};

const CHANNEL_LABEL: Record<TestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  linkedin: "LinkedIn",
};

// Loose shape checks — the BE stays authoritative; these only catch
// obvious wrong-channel input (e.g. a phone number in the LinkedIn field)
// with a helpful message instead of an invalid_identifier 400.
//
// The LinkedIn shape MUST mirror the three forms the BE route accepts
// (testChannelLink.ts): a full linkedin.com URL, an "in/<slug>" path, or a
// bare handle. The old `/linkedin\.com\//` was STRICTER than the BE and
// silently rejected valid identifiers like "in/you" / "@you" before the
// request ever left the browser — so the button appeared to "do nothing". A
// "+"-prefixed phone still fails all three branches → the helpful hint fires.
const IDENTIFIER_SHAPE: Record<TestChannel, RegExp> = {
  whatsapp: /^\+?[\d\s()-]{7,20}$/,
  telegram: /^(@?[A-Za-z][A-Za-z0-9_]{3,}|\+?[\d\s()-]{7,20})$/,
  linkedin:
    /^(https?:\/\/([\w-]+\.)*linkedin\.com\/.*|\/?in\/[\w%-]+\/?|@?[a-zA-Z0-9][\w-]{2,99})$/i,
};

const IDENTIFIER_HINT: Record<TestChannel, string> = {
  whatsapp: "Enter your phone number in international format, e.g. +972501234567.",
  telegram: "Enter your @handle (e.g. @you) or phone number, e.g. +972501234567.",
  linkedin: "Enter your LinkedIn profile URL, e.g. https://www.linkedin.com/in/you — a phone number belongs in the WhatsApp tab.",
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
    // Always reset on channel switch: load that channel's saved identifier or
    // CLEAR the field. Previously a missing saved value left the prior
    // channel's identifier in place — a WhatsApp phone number silently carried
    // into the LinkedIn tab and 400'd as invalid_identifier on submit.
    const saved = localStorage.getItem(STORAGE_KEY[channel]);
    setIdentifier(saved ?? "");
  }, [channel]);

  const test = useMutation({
    mutationFn: postTestChannelLink,
    onSuccess: (data) => {
      localStorage.setItem(STORAGE_KEY[channel], identifier.trim());
      // LinkedIn is clipboard-only — the "link" is just the profile URL (no
      // message prefill), so copy the message for the SDR to paste.
      if (channel === "linkedin") {
        void navigator.clipboard.writeText(data.message).catch(() => {});
      }
      // E6: a blocked popup makes window.open return null — don't claim success.
      const w = window.open(data.deepLinkUrl, "_blank", "noopener,noreferrer");
      if (!w) {
        toast({
          title: "Popup blocked",
          description: "Allow popups to open the link.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `Opening ${CHANNEL_LABEL[channel]}${channel === "linkedin" ? " — message copied" : ""}`,
        description:
          channel === "linkedin"
            ? `Profile opened for ${data.target} — paste the copied message into LinkedIn.`
            : `Message prefilled in the chat box — press send in the app to deliver to ${data.target}.`,
      });
    },
    onError: (err: ApiError) => {
      const code = err.code ?? err.message;
      toast({
        title: "Could not open test chat",
        description:
          code === "invalid_identifier" ? IDENTIFIER_HINT[channel] : code,
        variant: "destructive",
      });
    },
  });

  function handleOpenTestChat() {
    const id = identifier.trim();
    if (!id) return;
    // Cheap client-side shape check so a wrong-channel identifier gets a
    // helpful message instead of a round-trip to a 400.
    if (!IDENTIFIER_SHAPE[channel].test(id)) {
      toast({
        title: `That doesn't look like a ${CHANNEL_LABEL[channel]} identifier`,
        description: IDENTIFIER_HINT[channel],
        variant: "destructive",
      });
      return;
    }
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
            Test {CHANNEL_LABEL[channel]} send path
          </h2>
          <p className="text-xs text-muted-foreground">
            {channel === "linkedin"
              ? "Enter your own LinkedIn profile URL. Opens your profile and copies the message — LinkedIn can't prefill text, so paste it to confirm the path works."
              : "Enter your own number or handle. Opens the chat with your message already in the compose box — no copy-paste. Press send in the app to confirm delivery works."}
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
            <TabsTrigger value="linkedin" className="text-xs px-3">
              LinkedIn
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="test-channel-id">
            {channel === "whatsapp"
              ? "Your WhatsApp number"
              : channel === "linkedin"
                ? "Your LinkedIn profile URL"
                : "Your phone or @handle"}
          </Label>
          <Input
            id="test-channel-id"
            placeholder={
              channel === "whatsapp"
                ? "+972501234567"
                : channel === "linkedin"
                  ? "https://www.linkedin.com/in/you"
                  : "+972501234567 or @you"
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