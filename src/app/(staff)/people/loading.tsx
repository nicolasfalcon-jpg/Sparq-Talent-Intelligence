import { Skeleton } from "@/design-system/primitives";

export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto flex max-w-page flex-col gap-6 px-10 pt-6 pb-24 max-xl:px-5">
      <p className="text-mute">Reading documented skills and availability…</p>
      <div className="grid grid-cols-3 gap-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex flex-col gap-3 rounded-card bg-white p-6 shadow-card"><Skeleton width="60%" /><Skeleton width="80%" /><Skeleton width="40%" /></div>)}</div>
    </main>
  );
}
