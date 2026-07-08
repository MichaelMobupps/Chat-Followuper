import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CAMPAIGN_CHANNELS,
  type Campaign,
  type CreateCampaignInput,
} from "@/lib/api/campaigns";

const NO_CHANNEL = "__none__" as const;
const CHANNEL_OPTIONS = [NO_CHANNEL, ...CAMPAIGN_CHANNELS] as const;

const formSchema = z.object({
  // E3: limits match the api-server (name ≤120, description ≤1000, language a
  // bare 2-letter ISO code). BE rejects region-tagged codes like pt-BR.
  name: z
    .string()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  description: z.string().max(1000, "Too long").optional(),
  defaultChannel: z.enum(CHANNEL_OPTIONS).optional(),
  defaultSubVertical: z.string().max(100, "Too long").optional(),
  defaultLanguage: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[a-z]{2}$/.test(v),
      "Use a 2-letter ISO code, e.g. 'en' or 'hi'",
    ),
  defaultCountry: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[A-Z]{2}$/.test(v),
      "Use ISO 2-letter code, e.g. 'US' or 'IN'",
    ),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  campaign?: Campaign;
  onSubmit: (input: CreateCampaignInput) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function CampaignForm({
  campaign,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = "Save",
}: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: campaign?.name ?? "",
      description: campaign?.description ?? "",
      defaultChannel: campaign?.defaultChannel ?? NO_CHANNEL,
      defaultSubVertical: campaign?.defaultSubVertical ?? "",
      defaultLanguage: campaign?.defaultLanguage ?? "",
      defaultCountry: campaign?.defaultCountry ?? "",
    },
  });

  async function handleSubmit(values: FormValues) {
    const cleaned: CreateCampaignInput = {
      name: values.name.trim(),
    };
    if (values.description?.trim()) {
      cleaned.description = values.description.trim();
    }
    if (values.defaultChannel && values.defaultChannel !== NO_CHANNEL) {
      cleaned.defaultChannel = values.defaultChannel;
    }
    if (values.defaultSubVertical?.trim()) {
      cleaned.defaultSubVertical = values.defaultSubVertical.trim();
    }
    if (values.defaultLanguage?.trim()) {
      cleaned.defaultLanguage = values.defaultLanguage.trim();
    }
    if (values.defaultCountry?.trim()) {
      cleaned.defaultCountry = values.defaultCountry.trim();
    }
    await onSubmit(cleaned);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4"
        data-testid="campaign-form"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. India fintech Q2 push"
                  data-testid="input-campaign-name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="What this campaign is about, who it targets, success criteria."
                  rows={3}
                  data-testid="input-campaign-description"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="defaultChannel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default channel</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? NO_CHANNEL}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-campaign-channel">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_CHANNEL}>None</SelectItem>
                    {CAMPAIGN_CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="defaultSubVertical"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sub-vertical</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. fintech_lending"
                    data-testid="input-campaign-subvertical"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="defaultLanguage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Language</FormLabel>
                <FormControl>
                  <Input
                    placeholder="en"
                    data-testid="input-campaign-language"
                    {...field}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  2-letter ISO code, e.g. en, hi, pt
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="defaultCountry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl>
                  <Input
                    placeholder="IN"
                    data-testid="input-campaign-country"
                    {...field}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  ISO 2-letter, e.g. IN, US, BR
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              data-testid="button-cancel-campaign-form"
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="button-submit-campaign-form"
          >
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
