import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CampaignSelector } from "./CampaignSelector";
import type { CreateProspectInput } from "@/lib/api/prospects";

const PHONE_RE = /^\+[1-9]\d{6,14}$/;
const ISO_LANG_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
const ISO_COUNTRY_RE = /^[A-Z]{2}$/;

/**
 * The form is the union of:
 *   - Fields the prospect row needs (CreateProspectInput): phone, prospectName, country, language, etc.
 *   - Fields the research SSE needs: brand, country, language, subVertical, product, sdrContextNotes
 *
 * `brand` maps to the prospect's `company` column. Country/language/subVertical/product
 * are stored on both the prospect and used as research-stream input.
 *
 * Required for prospect creation: phone.
 * Required for research: brand, country, language, subVertical, product.
 *   These are also required by THIS form so research can run after create.
 */
const formSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(PHONE_RE, "E.164 format required, e.g. +919900000111"),
  prospectName: z.string().trim().min(1).max(200).optional().or(z.literal("")),
  brand: z.string().trim().min(1, "Brand is required").max(200),
  country: z
    .string()
    .trim()
    .regex(ISO_COUNTRY_RE, "ISO 2-letter, e.g. IN"),
  language: z
    .string()
    .trim()
    .regex(ISO_LANG_RE, "ISO code, e.g. en or pt-BR"),
  subVertical: z
    .string()
    .trim()
    .min(1, "Sub-vertical is required")
    .max(100),
  product: z.string().trim().min(1, "Product is required").max(200),
  sdrContextNotes: z.string().trim().max(5000).optional().or(z.literal("")),
  campaignId: z.string().nullable(),
});

export type SeederFormValues = z.infer<typeof formSchema>;

interface Props {
  defaultValues?: Partial<SeederFormValues>;
  onSubmit: (values: SeederFormValues) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function SeederForm({ defaultValues, onSubmit, isSubmitting }: Props) {
  const form = useForm<SeederFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: defaultValues?.phone ?? "",
      prospectName: defaultValues?.prospectName ?? "",
      brand: defaultValues?.brand ?? "",
      country: defaultValues?.country ?? "",
      language: defaultValues?.language ?? "en",
      subVertical: defaultValues?.subVertical ?? "",
      product: defaultValues?.product ?? "",
      sdrContextNotes: defaultValues?.sdrContextNotes ?? "",
      campaignId: defaultValues?.campaignId ?? null,
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        data-testid="seeder-form"
      >
        {/* Contact */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Contact
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+919900000111"
                      data-testid="input-phone"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    E.164 format. Required and immutable after save.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prospectName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Anjali Kapoor"
                      data-testid="input-prospect-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        {/* Brand context */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Brand context
          </h2>
          <p className="text-xs text-muted-foreground -mt-2">
            These fields are used both to populate the prospect row and as
            input for the research stream.
          </p>
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand / company</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Probo"
                    data-testid="input-brand"
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
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="IN"
                      maxLength={2}
                      data-testid="input-country"
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
            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Language</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="en"
                      data-testid="input-language"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    en, hi, pt-BR, etc.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subVertical"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sub-vertical</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. real_money_gaming"
                      data-testid="input-subvertical"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="product"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. opinion-trading app"
                      data-testid="input-product"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="sdrContextNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SDR context notes (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Anything the research model should know that isn't obvious — recent funding, channel mix, prior conversations."
                    rows={3}
                    data-testid="input-context-notes"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Campaign */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Campaign (optional)
          </h2>
          <FormField
            control={form.control}
            name="campaignId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Attach to campaign</FormLabel>
                <FormControl>
                  <CampaignSelector
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Defaults from the campaign apply only if you leave the field above blank. You can change attachment later from the prospect detail page.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="button-seeder-start"
          >
            {isSubmitting ? "Saving…" : "Save & start research"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * Map the form values to a CreateProspectInput. Empty optional fields
 * are dropped so the server doesn't store empty strings.
 */
export function formValuesToCreateInput(
  values: SeederFormValues,
): CreateProspectInput {
  const input: CreateProspectInput = {
    phone: values.phone,
    sourceMode: "manual",
  };
  if (values.prospectName?.trim()) input.prospectName = values.prospectName.trim();
  if (values.brand?.trim()) input.company = values.brand.trim();
  if (values.country?.trim()) input.country = values.country.trim();
  if (values.language?.trim()) input.language = values.language.trim();
  if (values.subVertical?.trim()) input.subVertical = values.subVertical.trim();
  if (values.product?.trim()) input.product = values.product.trim();
  if (values.sdrContextNotes?.trim())
    input.contextNotes = values.sdrContextNotes.trim();
  if (values.campaignId) input.campaignId = values.campaignId;
  return input;
}
