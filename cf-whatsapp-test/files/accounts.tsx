import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const DEFAULT_MESSAGE = "Test message from Chat Followuper.";

export default function AccountsPage() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const digits = phone.replace(/[^0-9]/g, "");
  const link =
    digits.length >= 6
      ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
      : null;
  const looksLocal = digits.startsWith("0");

  function openWhatsapp() {
    if (!link) return;
    // Opened inside the click itself so the browser treats it as a direct
    // action and does not suppress it as a blocked pop-up.
    window.open(link, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Accounts
        </h1>
        <p className="text-sm text-muted-foreground">
          Test the WhatsApp send, and account settings.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-medium">
              <MessageCircle className="h-4 w-4" />
              Send a test to yourself
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter a WhatsApp number you can check, with the country code, then
              open WhatsApp with the message ready and press send. This confirms
              the send works from end to end.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-phone">WhatsApp number</Label>
            <Input
              id="test-phone"
              placeholder="+972 5X XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="test-phone"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-message">Message</Label>
            <Textarea
              id="test-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              data-testid="test-message"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={openWhatsapp}
              disabled={!link}
              data-testid="test-open"
            >
              <MessageCircle className="mr-1 h-4 w-4" />
              Open in WhatsApp
            </Button>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground underline underline-offset-4"
                data-testid="test-link"
              >
                or open this link directly
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">
                Enter a valid number to enable the button.
              </span>
            )}
          </div>

          {link ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="test-target"
            >
              Opens a chat with +{digits}.
            </p>
          ) : null}
          {looksLocal ? (
            <p className="text-sm text-amber-700" data-testid="test-hint">
              This number starts with a zero. International numbers use the
              country code instead, for example 972 for Israel.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
