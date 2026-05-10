import { useState, useMemo } from "react";
import { Upload, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MAX_URLS = 50;

const DEFAULT_TITLES =
  // Mirrors the email prospector's title strategy (PRIMARY + SECONDARY
  // + EXEC_FALLBACK from prospector/stages/s3_enrich.py:237-252).
  // Lowercase fuzzy-match terms — Apollo's person_titles does partial
  // matching, so "growth" catches "Head of Growth", "VP Growth", etc.
  // The textarea remains editable; user can override per-search.
  "user acquisition, ua, growth, performance marketing, paid acquisition, paid media, digital marketing, media buying, customer acquisition, marketing manager, growth marketing, business development, partnerships, strategic partnerships, growth partnerships, marketing director, marketing lead, ceo, chief executive, founder, co-founder, cmo, chief marketing, vp marketing, head of marketing, director of marketing, vp growth, head of growth";

export interface UrlInputSubmit {
  urls: string[];
  titles: string[];
  country: string | null;
}

interface Props {
  onSubmit: (s: UrlInputSubmit) => void;
}

interface ClassifiedUrl {
  raw: string;
  kind: "play_store" | "app_store" | "website" | "invalid";
  reason?: string;
}

function classify(line: string): ClassifiedUrl {
  const trimmed = line.trim();
  if (!trimmed) return { raw: trimmed, kind: "invalid", reason: "empty" };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { raw: trimmed, kind: "invalid", reason: "not a URL" };
  }
  const host = parsed.hostname.toLowerCase();
  if (host.includes("play.google.com")) return { raw: trimmed, kind: "play_store" };
  if (host.includes("apps.apple.com") || host.includes("itunes.apple.com")) {
    return { raw: trimmed, kind: "app_store" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { raw: trimmed, kind: "invalid", reason: "non-http(s) scheme" };
  }
  return { raw: trimmed, kind: "website" };
}

export function UrlInput({ onSubmit }: Props) {
  const [text, setText] = useState("");
  const [titles, setTitles] = useState(DEFAULT_TITLES);
  const [country, setCountry] = useState("");

  const classified = useMemo<ClassifiedUrl[]>(() => {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map(classify);
  }, [text]);

  const validCount = classified.filter((c) => c.kind !== "invalid").length;
  const invalidCount = classified.length - validCount;
  const overLimit = validCount > MAX_URLS;

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result ?? "");
      setText(content);
    };
    reader.readAsText(file);
  }

  function handleSubmit() {
    const valid = classified.filter((c) => c.kind !== "invalid").map((c) => c.raw);
    const titleList = titles
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const countryClean = country.trim().toUpperCase();
    onSubmit({
      urls: valid.slice(0, MAX_URLS),
      titles: titleList,
      country: /^[A-Z]{2}$/.test(countryClean) ? countryClean : null,
    });
  }

  const canSubmit = validCount > 0 && validCount <= MAX_URLS;

  return (
    <div className="space-y-4" data-testid="bulk-url-input">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-urls">URLs (one per line, max {MAX_URLS})</Label>
            <Textarea
              id="bulk-urls"
              placeholder={"https://probo.in\nhttps://play.google.com/store/apps/details?id=com.example\nhttps://apps.apple.com/us/app/example/id123"}
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-sm"
              data-testid="textarea-urls"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("bulk-url-file")?.click()}
                data-testid="button-upload"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload .txt
              </Button>
              <input
                id="bulk-url-file"
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={handleFileUpload}
              />
              {text.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setText("")}
                  data-testid="button-clear"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
              {classified.length > 0 && (
                <div className="flex gap-2 ml-auto text-xs">
                  <Badge variant="outline" data-testid="badge-valid-count">
                    {validCount} valid
                  </Badge>
                  {invalidCount > 0 && (
                    <Badge variant="destructive" data-testid="badge-invalid-count">
                      {invalidCount} invalid
                    </Badge>
                  )}
                  {overLimit && (
                    <Badge variant="destructive">
                      over {MAX_URLS} limit; only first {MAX_URLS} will be processed
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-titles">
                Title filters (comma-separated)
              </Label>
              <Input
                id="bulk-titles"
                value={titles}
                onChange={(e) => setTitles(e.target.value)}
                data-testid="input-titles"
              />
              <p className="text-xs text-muted-foreground">
                Searches Apollo for people whose titles match any of these.
                Leave defaults for sales / growth roles.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-country">Country (optional, ISO 2-letter)</Label>
              <Input
                id="bulk-country"
                placeholder="IN"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                data-testid="input-country"
              />
              <p className="text-xs text-muted-foreground">
                Restricts org search to this country if set.
              </p>
            </div>
          </div>

          {invalidCount > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs space-y-1">
              <div className="flex items-center gap-1 font-medium">
                <AlertCircle className="h-3 w-3" /> Invalid lines (skipped):
              </div>
              <ul className="space-y-0.5 font-mono text-[11px]">
                {classified
                  .filter((c) => c.kind === "invalid")
                  .slice(0, 5)
                  .map((c, i) => (
                    <li key={i}>
                      {c.raw || "(empty)"} — {c.reason}
                    </li>
                  ))}
                {classified.filter((c) => c.kind === "invalid").length > 5 && (
                  <li className="italic">
                    +{classified.filter((c) => c.kind === "invalid").length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="button-discover"
        >
          Discover {validCount > 0 ? `(${Math.min(validCount, MAX_URLS)} URL${validCount === 1 ? "" : "s"})` : ""}
        </Button>
      </div>
    </div>
  );
}
