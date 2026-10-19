type PageMeta = { title?: string; name?: string; property?: string; content?: string };

/** Complete leaf metadata while retaining the route's dynamic title and existing tags. */
export function completePageHead(
  head: { meta: PageMeta[] },
  fallbackTitle: string,
  fallbackDescription: string,
) {
  const meta = [...head.meta];
  const title = meta.find((tag) => tag.title)?.title ?? fallbackTitle;
  const description = meta.find((tag) => tag.name === "description")?.content ?? fallbackDescription;
  if (!meta.some((tag) => tag.title)) meta.push({ title });
  if (!meta.some((tag) => tag.name === "description")) meta.push({ name: "description", content: description });
  for (const [property, content] of [["og:title", title], ["og:description", description], ["og:type", "website"]]) {
    if (!meta.some((tag) => tag.property === property)) meta.push({ property, content });
  }
  if (!meta.some((tag) => tag.name === "twitter:card")) meta.push({ name: "twitter:card", content: "summary" });
  return { meta };
}