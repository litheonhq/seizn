import { NextRequest } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import {
  AuthorUiNotFoundError,
  readJsonBody,
  withAuthorUiService,
} from "@/lib/author/ui";

export const runtime = "nodejs";

interface BillingPortalBody {
  return_to?: unknown;
}

export async function POST(request: NextRequest) {
  return withAuthorUiService(request, async (_service, userId) => {
    const body = await readJsonBody(request) as BillingPortalBody;
    const returnPath = typeof body.return_to === "string" && body.return_to.startsWith("/")
      ? body.return_to
      : "/dashboard/billing";
    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single<{ stripe_customer_id?: string | null }>();

    if (!profile?.stripe_customer_id) {
      throw new AuthorUiNotFoundError("No billing account found");
    }

    const stripe = getStripeClient();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${request.nextUrl.origin}${returnPath}`,
    });

    return { url: portalSession.url };
  });
}
