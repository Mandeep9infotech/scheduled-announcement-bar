
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { redirect } = await import("react-router");
  await authenticate.admin(request);
  throw redirect("/app/onboarding");
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
