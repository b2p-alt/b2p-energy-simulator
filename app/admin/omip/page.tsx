// app/admin/omip/page.tsx
import { Suspense } from "react";
import UploadClient from "./UploadClient";

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams?: { key?: string };
}) {
  const key = searchParams?.key ?? "";

  return (
    <Suspense fallback={<div className="p-6 text-sm">A carregar…</div>}>
      <UploadClient adminKey={key} />
    </Suspense>
  );
}
