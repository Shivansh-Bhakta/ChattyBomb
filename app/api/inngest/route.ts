import { serve } from "inngest/next";
import { functions } from "@/inngest/functions";
import { inngest } from "@/lib/queue";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
