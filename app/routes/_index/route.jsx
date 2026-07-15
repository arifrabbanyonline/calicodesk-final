import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const search = url.searchParams.toString();
  throw redirect(search ? `/app?${search}` : "/app");
};

export default function Index() {
  return null;
}
