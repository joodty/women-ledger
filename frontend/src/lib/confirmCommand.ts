import type { useSpace } from "../stores/space";
export async function confirmCommand(
  s: ReturnType<typeof useSpace>,
  type: string,
  collection: string,
  id: string,
  prompt: string,
  label: string,
  expectedVersion?: number,
) {
  const version = expectedVersion ?? s.version(collection, id);
  if (!confirm(prompt)) return false;
  const operation = await s.submit(type, { id }, label, collection, version);
  const pending = s.pending.find((x) => x.command.id === operation);
  if (pending?.status === "error" || pending?.status === "conflict")
    throw Error(pending.message || "操作尚未完成，请查看待处理内容");
  return true;
}
